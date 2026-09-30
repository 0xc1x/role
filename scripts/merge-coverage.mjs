#!/usr/bin/env bun
/**
 * Merge per-suite Bun lcov reports into one root-relative report.
 *
 * Why this exists instead of `cat`:
 *
 *  1. `SF:` paths in a Bun lcov are relative to the CWD of the package that
 *     produced them, so `src/components/ui/button.tsx` from admin and the
 *     same path from landing collide. Admin and landing share 20 shadcn
 *     routes, so a naive concatenation merges two different files into one
 *     ambiguous record. We rewrite every path to be root-relative first.
 *
 *  2. `--coverage-dir` OVERWRITES, it never accumulates, so unit and e2e have
 *     to write to separate directories and be merged here.
 *
 *  3. Bun's lcov has no `FN:`/`FNDA:` records, only per-file `FNF`/`FNH`.
 *     A true function-level merge is impossible; `max()` across suites is the
 *     closest approximation (see the caveat in the CI docs).
 *
 *  4. `% Lines` from Bun's text table is inflated by dead code: a file where
 *     nothing executed still reports a non-zero `% Lines` from an unreachable
 *     branch. The lcov is micro (sum/sum) and is the only number we publish.
 *
 * Usage:
 *   bun scripts/merge-coverage.mjs <packageDir>:<lcovPath> [...]
 *
 * With no arguments it merges the canonical layout:
 *   <pkg>/coverage/unit/lcov.info and <pkg>/coverage/e2e/lcov.info
 * for every workspace that has one, plus the root `coverage/supabase`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUTPUT_DIR = resolve(ROOT, "coverage");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "lcov.info");

/**
 * Paths that are never application source.
 *
 * Every pattern is matched against the ROOT-RELATIVE path (that is the whole
 * point of the rewrite), so each one is anchored with `(^|/)` rather than
 * `^`. `^test/` would never match `apps/api/test/db.ts`.
 *
 * `packages/commons/dist/` matters most: `@0xc1x/role-commons` resolves to
 * `dist/`, so every consumer drags the 166 compiled files into its report even
 * though they are already counted by the commons report itself. Unfiltered,
 * landing reports 82.95% lines when the real number is 67.99%.
 */
const EXCLUDE = [
  // Build output and dependencies.
  /(^|\/)packages\/commons\/dist\//,
  /(^|\/)node_modules\//,
  // Test files and test harness. `__tests__/` holds the specs themselves;
  // `*.e2e-spec.ts` is the api e2e convention (a glob `*` does not cross a
  // dot, so `*.spec.ts` alone never matched it).
  /(^|\/)__tests__\//,
  /\.spec\.tsx?$/,
  /\.e2e-spec\.tsx?$/,
  /\.test\.tsx?$/,
  // Harness that only exists to make tests run.
  /(^|\/)test\//,
  /(^|\/)test-preload\.ts$/,
  /(^|\/)test-utils\//,
  /(^|\/)test-support\//,
  /(^|\/)src\/test-setup\.ts$/,
];

/** Packages whose coverage we report separately in the summary table. */
const PACKAGES = [
  "packages/commons",
  "apps/api",
  "apps/admin",
  "apps/landing",
  "apps/mobile",
];

function parseLcov(text, packageDir) {
  const records = [];
  for (const block of text.split("end_of_record")) {
    const sf = block.match(/SF:(.*)/)?.[1]?.trim();
    if (!sf) continue;
    const lines = new Map();
    for (const line of block.split("\n")) {
      const m = line.match(/^DA:(\d+),(\d+)/);
      if (!m) continue;
      const lineNo = Number(m[1]);
      // Hit counts sum across suites: a line hit by unit and by e2e was hit
      // twice. Summing is what makes the merged number micro (sum/sum).
      lines.set(lineNo, (lines.get(lineNo) ?? 0) + Number(m[2]));
    }
    records.push({
      // Root-relative is what makes the merge unambiguous across packages.
      path: relative(ROOT, resolve(packageDir, sf)).split("\\").join("/"),
      lines,
      fnf: Number(block.match(/^FNF:(\d+)/m)?.[1] ?? 0),
      fnh: Number(block.match(/^FNH:(\d+)/m)?.[1] ?? 0),
    });
  }
  return records;
}

function merge(records) {
  const byPath = new Map();
  for (const record of records) {
    if (EXCLUDE.some((re) => re.test(record.path))) continue;
    let merged = byPath.get(record.path);
    if (!merged) {
      merged = { path: record.path, lines: new Map(), fnf: 0, fnh: 0 };
      byPath.set(record.path, merged);
    }
    for (const [lineNo, hits] of record.lines) {
      merged.lines.set(lineNo, (merged.lines.get(lineNo) ?? 0) + hits);
    }
    // Bun emits no FN:/FNDA:, so a real function-level merge is impossible.
    // max() is the best available approximation: a suite that covered a
    // function reports it as hit, and the union of hits is the closest we can
    // get to "was this function ever executed".
    merged.fnf = Math.max(merged.fnf, record.fnf);
    merged.fnh = Math.max(merged.fnh, record.fnh);
  }
  return byPath;
}

function summarize(records) {
  let lf = 0;
  let lh = 0;
  let fnf = 0;
  let fnh = 0;
  for (const r of records) {
    lf += r.lines.size;
    for (const hits of r.lines.values()) if (hits > 0) lh += 1;
    fnf += r.fnf;
    fnh += r.fnh;
  }
  return {
    files: records.length,
    lines: lf === 0 ? 0 : (100 * lh) / lf,
    functions: fnf === 0 ? 0 : (100 * fnh) / fnf,
    lf,
    lh,
    fnf,
    fnh,
  };
}

function serialize(record) {
  const out = ["TN:", `SF:${record.path}`, `FNF:${record.fnf}`, `FNH:${record.fnh}`];
  const lineNos = [...record.lines.keys()].sort((a, b) => a - b);
  for (const lineNo of lineNos) out.push(`DA:${lineNo},${record.lines.get(lineNo)}`);
  out.push(`LF:${lineNos.length}`);
  out.push(`LH:${lineNos.filter((n) => record.lines.get(n) > 0).length}`);
  out.push("end_of_record");
  return out.join("\n");
}

/** Discover `<pkg>/coverage/{unit,e2e}/lcov.info` plus the root supabase suite. */
function discoverSuites() {
  const suites = [];
  for (const pkg of PACKAGES) {
    for (const kind of ["unit", "e2e"]) {
      const file = resolve(ROOT, pkg, "coverage", kind, "lcov.info");
      if (!existsSync(file)) continue;
      suites.push({ packageDir: pkg, label: `${pkg}:${kind}`, file });
    }
  }
  const supabase = resolve(ROOT, "coverage", "supabase", "lcov.info");
  if (existsSync(supabase)) {
    suites.push({ packageDir: ".", label: "supabase", file: supabase });
  }
  return suites;
}

function main() {
  const explicit = process.argv.slice(2);
  const suites = explicit.length
    ? explicit.map((arg) => {
        const idx = arg.indexOf("::");
        if (idx === -1) {
          throw new Error(`Expected <packageDir>::<lcovPath>, got "${arg}"`);
        }
        const packageDir = arg.slice(0, idx);
        return {
          packageDir,
          label: packageDir,
          file: resolve(ROOT, arg.slice(idx + 2)),
        };
      })
    : discoverSuites();

  if (suites.length === 0) {
    console.error("No lcov reports found. Run the coverage scripts first.");
    process.exit(1);
  }

  const missing = suites.filter((s) => !existsSync(s.file));
  if (missing.length > 0) {
    for (const suite of missing) console.error(`missing: ${suite.file}`);
    process.exit(1);
  }

  const all = [];
  for (const suite of suites) {
    const text = readFileSync(suite.file, "utf8");
    const records = parseLcov(text, resolve(ROOT, suite.packageDir));
    console.error(`read ${records.length} records from ${suite.label}`);
    all.push(...records);
  }

  const merged = merge(all);
  const ordered = [...merged.values()].sort((a, b) => a.path.localeCompare(b.path));

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, `${ordered.map(serialize).join("\n")}\n`);

  // Per-package rollup for the CI summary. Attribution is by path prefix, so a
  // shared path can only ever land in one package.
  const report = { total: summarize(ordered), packages: {} };
  for (const pkg of PACKAGES) {
    const scoped = ordered.filter((r) => r.path.startsWith(`${pkg}/`));
    if (scoped.length === 0) continue;
    report.packages[pkg] = summarize(scoped);
  }
  const supabaseFiles = ordered.filter((r) => r.path.startsWith("supabase/"));
  if (supabaseFiles.length > 0) report.packages["supabase (edge functions)"] = summarize(supabaseFiles);

  writeFileSync(resolve(OUTPUT_DIR, "summary.json"), `${JSON.stringify(report, null, 2)}\n`);

  console.error(`\nwrote ${relative(ROOT, OUTPUT_FILE)} (${ordered.length} files)`);
  for (const [name, s] of Object.entries(report.packages)) {
    console.error(
      `  ${name.padEnd(26)} lines ${s.lines.toFixed(2).padStart(6)}%  functions ${s.functions.toFixed(2).padStart(6)}%  (${s.files} files)`,
    );
  }
}

main();