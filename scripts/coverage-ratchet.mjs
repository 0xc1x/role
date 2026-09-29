#!/usr/bin/env bun
/**
 * Coverage ratchet: REPORT drift, never fail the build.
 *
 * Why no threshold: Bun's `coverageThreshold` is enforced PER FILE, not as a
 * global average. That is strictly harsher than the global Jest average the
 * old bunfig.toml says it replaced, and nothing in the repo ever gated on it.
 * Umbralling today would mean pinning a number whose meaning is "the average
 * of per-file numbers that nobody averages", and the first PR that adds a
 * legitimate untested file breaks CI on a rule written nowhere visible.
 *
 * The lowest file in the repo today is `redis-throttler.storage.ts` at 73.64%
 * lines. That is real debt worth SEEING, which is exactly what reporting does.
 *
 * The tracked metric is % FUNCTIONS, not % lines. `% Lines` is inflated by
 * dead code: a file where nothing executed still reports non-zero lines from an
 * unreachable branch, and scaled to 20 dead functions a suite can report 0%
 * functions with 15.97% lines. Lines can never be the gate.
 *
 * Bun 1.4.0 has NO branch coverage (`strings $(command -v bun) | grep -c BRDA`
 * is 0). A `branches` threshold exits 0 and is ignored in SILENCE, which is the
 * worst failure mode there is. This ratchet therefore publishes no branch
 * number at all rather than publishing one that does not exist.
 *
 * Usage:
 *   bun scripts/coverage-ratchet.mjs              # report drift
 *   bun scripts/coverage-ratchet.mjs --write      # re-record the baseline
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SUMMARY = resolve(ROOT, "coverage", "summary.json");
const BASELINE = resolve(ROOT, "docs", "coverage-baseline.json");
const WRITE = process.argv.includes("--write");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

if (!existsSync(SUMMARY)) {
  console.error("coverage/summary.json not found. Run `bun run coverage:merge` first.");
  process.exit(1);
}

const summary = readJson(SUMMARY);
const baseline = existsSync(BASELINE) ? readJson(BASELINE) : { packages: {} };

if (WRITE) {
  const packages = {};
  for (const [name, stats] of Object.entries(summary.packages)) {
    // The supabase edge functions are tracked on their own but are not app
    // source, so they stay out of the ratchet.
    if (name.startsWith("supabase")) continue;
    packages[name] = Number(stats.functions.toFixed(2));
  }
  const next = {
    $comment:
      "Baseline for the coverage ratchet. Percentages are % of FUNCTIONS over filtered app source, per package, measured from the merged lcov (micro, sum/sum). Regenerate deliberately with `bun run coverage:ratchet --write` after reviewing the drift; never as a side effect of running the suite.",
    recordedAt: new Date().toISOString().slice(0, 10),
    commit: process.env.GITHUB_SHA?.slice(0, 7) ?? "local",
    packages,
  };
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.error(`baseline written to ${BASELINE.replace(`${ROOT}/`, "")}`);
  for (const [name, value] of Object.entries(packages)) {
    console.error(`  ${name.padEnd(20)} ${value.toFixed(2)}%`);
  }
  process.exit(0);
}

const rows = [];
let regressions = 0;
for (const [name, stats] of Object.entries(summary.packages)) {
  if (name.startsWith("supabase")) continue;
  const current = Number(stats.functions.toFixed(2));
  const before = baseline.packages[name];
  const drift = before === undefined ? null : Number((current - before).toFixed(2));
  // A rounding wobble of a hundredth is not drift worth a conversation.
  const moved = drift !== null && Math.abs(drift) >= 0.01;
  if (moved && drift < 0) regressions += 1;
  rows.push({ name, current, before: before ?? null, drift, files: stats.files });
}

const pad = (value, width) => String(value).padStart(width);
const nameWidth = Math.max(4, ...rows.map((r) => r.name.length));

const lines = [];
lines.push("| package | % functions | baseline | drift | files |");
lines.push(`| --- | ---: | ---: | ---: | ---: |`);
for (const row of rows) {
  const arrow = row.drift === null ? "—" : row.drift > 0 ? `+${row.drift}` : `${row.drift}`;
  lines.push(
    `| \`${row.name}\` | ${pad(`${row.current.toFixed(2)}%`, 6)} | ${
      row.before === null ? "—" : pad(`${row.before.toFixed(2)}%`, 6)
    } | ${pad(arrow, 6)} | ${pad(row.files, 5)} |`,
  );
}
lines.push("");
lines.push(
  `Total merged: ${summary.total.files} files, ${summary.total.lines.toFixed(2)}% lines, ${summary.total.functions.toFixed(2)}% functions.`,
);
lines.push("");
lines.push(
  "Reported, not enforced. Branch coverage is not published because Bun 1.4.0 does not instrument it. `% Lines` is shown for context only and is inflated by dead code.",
);

const markdown = lines.join("\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Test coverage\n\n${markdown}\n\n`);
}

// Also print locally so the script is useful outside CI.
console.log(markdown);
if (baseline.recordedAt) {
  console.error(`\nbaseline recorded ${baseline.recordedAt} at ${baseline.commit ?? "?"}`);
}
console.error(
  regressions > 0
    ? `${regressions} package(s) below baseline. Reported only — this does not fail the build.`
    : "No package below baseline.",
);