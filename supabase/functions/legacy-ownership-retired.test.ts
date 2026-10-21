import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * `business_ownership` was retired on 2026-10-21 by Plan 3's Task 10
 * (`20261021005034_drop_business_ownership.sql`). The table DOES NOT EXIST in the
 * live database, and the check that says so is a `SELECT` against `pg_class`.
 *
 * This file is the guard for the OTHER direction: the thing that no database
 * check can see.
 *
 * A Postgres function that names a missing table fails WHEN IT RUNS, not when
 * it compiles — so `pg_proc.prosrc` is the right place to look for that class
 * of defect. But a PostgREST client is not a Postgres function: the Edge
 * Functions read the database over HTTP, and their table names never appear in
 * `pg_proc` or in `pg_policies`. The six readers of the retired table were, in
 * total, one mobile repository, five API repositories, two Postgres functions
 * and ONE EDGE FUNCTION — and the edge function is the one that a `SELECT`
 * against the catalog cannot find.
 *
 * That is why this file exists. It reads the repository's own source and fails
 * when a runtime file asks for a table that is not there.
 *
 * What it does NOT flag: the sealed migrations (they are history, and they are
 * the ones that DROP the table), the documentation, and the specs that assert
 * the table's ABSENCE — asserting that something is gone means naming it.
 */

const REPO_ROOT = join(import.meta.dir, "..", "..");

/** The trees that RUN. `docs/` and `supabase/migrations/` are history. */
const RUNTIME_TREES = ["apps", "packages", "supabase/functions", "scripts"];

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  ".output",
  "coverage",
  ".expo",
  ".next",
  ".tanstack",
  ".vercel",
]);

/**
 * The shapes a PostgREST client uses to name a table, and the shape raw SQL
 * uses. Both are deliberate: a false negative here is the whole point of the
 * file, and a false positive is a comment in a migration.
 */
const TABLE_READ_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "postgrest .from()", pattern: /\.from\(\s*["'`]business_ownership["'`]/ },
  { name: "raw sql", pattern: /\bfrom\s+(public\.)?business_ownership\b/i },
  { name: "join into it", pattern: /\bjoin\s+(public\.)?business_ownership\b/i },
  { name: "insert into it", pattern: /\binsert\s+into\s+(public\.)?business_ownership\b/i },
  { name: "update it", pattern: /\bupdate\s+(public\.)?business_ownership\b/i },
  { name: "delete from it", pattern: /\bdelete\s+from\s+(public\.)?business_ownership\b/i },
];

async function collectRuntimeFiles(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectRuntimeFiles(full, out);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The comment and the prose are stripped before the pattern runs: this file
 * talks about the retired table in prose, and so do the source files that
 * explain WHY they no longer read it. What matters is CODE.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/^\s*\*.*$/gm, " ");
}

describe("the retired business_ownership table", () => {
  test("no runtime file reads a table that does not exist", async () => {
    const offenders: string[] = [];

    for (const tree of RUNTIME_TREES) {
      const files = await collectRuntimeFiles(join(REPO_ROOT, tree));
      for (const file of files) {
        const source = await readFile(file, "utf8");
        const code = codeOnly(source);
        for (const { name, pattern } of TABLE_READ_PATTERNS) {
          if (pattern.test(code)) {
            offenders.push(`${relative(REPO_ROOT, file)} — ${name}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test("the edge function that fires on every order event reads the MEMBERSHIP", async () => {
    const file = join(REPO_ROOT, "supabase/functions/handle-order-event/index.ts");
    const source = await readFile(file, "utf8");
    const code = codeOnly(source);

    // The table is gone, so the CODE must not name it. The comment may: the
    // comment is the one that says WHY this file reads the membership, and a
    // file that explains the change is worth more than a file that hides it.
    expect(code).not.toContain("business_ownership");

    // And it must read the owner where the owner lives now, with the rule the
    // database itself uses: role `owner`, status `active`, not archived.
    expect(code).toContain('from("business_members")');
    expect(code).toContain('.eq("role", "owner")');
    expect(code).toContain('.eq("status", "active")');
    expect(code).toContain('.is("deleted_at", null)');
  });

  test("the Drizzle mirror does not carry the retired table", async () => {
    const file = join(REPO_ROOT, "apps/api/src/database/schema/business-companions.ts");
    const source = await readFile(file, "utf8");
    expect(source).not.toContain("businessOwnership");
  });
});
