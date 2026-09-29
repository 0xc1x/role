import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';

/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * Four client-facing catalog RPCs were dead to every client role.
 * `active_offers_near`, `active_businesses_near`, `popular_zones` and
 * `active_offer_category_counts` are SECURITY INVOKER functions in `public`,
 * and their bodies each carried an inline
 *
 *     exists (select 1 from public.business_moderation m
 *             where m.business_id = b.id and m.verification_status = 'approved')
 *
 * `public.business_moderation` holds ZERO privileges for `anon` and
 * `authenticated` — `revoke all on public.business_moderation from anon,
 * authenticated` in 20260925225227 — so every call raised, for every client
 * role, at executor startup:
 *
 *     ERROR  42501  permission denied for table business_moderation
 *
 * which the Expo client sees as `POST /rest/v1/rpc/active_offers_near` → 403.
 * The Explore screen does not load. `CREATE FUNCTION` still succeeds, so the
 * ledger replays green and the breakage only appears on the first client read;
 * that gap between "the DDL applied" and "the function is callable" is the
 * whole reason this file is a source-level test rather than a migration
 * presence check.
 *
 * The fix is 20260929010149_route_client_rpcs_through_moderation_helper.sql:
 * the four call `public.business_is_approved(uuid)`, a SECURITY DEFINER helper
 * that 20260928161526 already granted EXECUTE on to both client roles. The
 * same mistake was made once before, for an RLS policy, and the header of
 * 20260928161526 (lines 72-125) is the measurement that ruled the inline form
 * out.
 *
 * ─── Why this file reads text and does not connect to a database ───────────
 *
 * The defect is a shape in the source, and the shape is the invariant: an
 * invoker-owned body that names a table no client role can read. A live
 * database can only observe that by calling the function and reading a 42501,
 * which is a good end-to-end check and not a cheap one: it needs the replay
 * harness, and it cannot tell you WHICH of the four shapes in the ledger
 * introduced the call site. The other specs in this directory already own the
 * runtime half — `businesses.rls.db.spec.ts` pins the zero-privilege state of
 * the companions, and it needs pinning because the escape from this bug is to
 * open the table. This file owns the half nothing else looks at: the call
 * sites, in every migration, forever.
 *
 * ─── THE LIMIT OF A TEXT TEST, STATED UP FRONT ─────────────────────────────
 *
 * 20260929010149 does not re-emit the four bodies. It reads
 * `pg_get_functiondef` out of `pg_proc` and `execute`s a predicate swap, so
 * after it applies there is NO `create or replace` text anywhere in this
 * directory for those four functions. The last literal definition of each is
 * still the pre-fix body, with the inline subquery in it, and that is
 * correct: it is the input the rewrite consumes.
 *
 * So the assertions below pin the PRECONDITIONS of the rewrite — that the
 * pattern it searches for is byte-identical to the text in the ledger, that
 * nothing has redefined the function since, that the helper it substitutes is
 * SECURITY DEFINER and executable, and that the migration aborts rather than
 * no-ops — instead of pretending to read a post-rewrite body that does not
 * exist in source. The proof that the swap happened belongs to the migration's
 * own post-condition guard, which runs in the target environment.
 */
/**
 * Walks up from this file until it finds `supabase/migrations`.
 *
 * The sibling spec in this directory counts five `..` segments, which is right
 * for `apps/api/src/database/security` and wrong for the compiled copy at
 * `apps/api/dist/src/database/security` — one level deeper, so the count
 * resolves to `apps/supabase/migrations` and the module throws ENOENT at load.
 * `bun test --isolate src` matches that compiled path too, because `src` is a
 * substring filter, and a load-time throw surfaces as "Unhandled error between
 * tests" rather than a failure: the suite still reports green.
 *
 * Searching beats counting because the answer is verified rather than assumed.
 * A wrong guess here cannot skip a test quietly — `readdirSync` throws, and
 * every assertion in this file depends on the directory being real.
 */
function resolveMigrationsDir(): string {
  let dir = import.meta.dir;
  for (let depth = 0; depth < 12; depth += 1) {
    const candidate = join(dir, 'supabase', 'migrations');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(
    `supabase/migrations not found walking up from ${import.meta.dir}. ` +
      'This spec reads the migration ledger; it cannot assert anything without it.',
  );
}

const MIGRATIONS_DIR = resolveMigrationsDir();

/** Replay order. The `YYYYMMDDHHMMSS` prefix sorts lexicographically, which is
 *  exactly the order `supabase db push` applies them in, so index in this
 *  array IS the position in history. Every "which definition is current"
 *  question in this file is answered with it. */
const MIGRATION_FILES: string[] = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const GATE_MIGRATION =
  '20260928161526_add_business_moderation_catalog_gate.sql';
const ROUTING_MIGRATION =
  '20260929010149_route_client_rpcs_through_moderation_helper.sql';
const COMPANION_TABLES_MIGRATION =
  '20260925225227_businesses_companion_tables.sql';
const RLS_ON_UNRECORDED_MIGRATION =
  '20260928184943_enable_rls_on_unrecorded_tables.sql';

/**
 * The four catalog RPCs the routing migration rewrites. This list is not the
 * source of truth for the exemption below — the migration is — so it exists to
 * be compared against what the migration actually rewrites. A function added
 * here without a matching `apply_rewrite` fails a test rather than widening
 * the exemption.
 */
const ROUTED_FUNCTIONS = [
  'active_businesses_near',
  'active_offer_category_counts',
  'active_offers_near',
  'popular_zones',
];

/**
 * Tables no client role holds a single privilege on. `business_moderation`
 * and `business_finance` are the two companions phase 3 moved off
 * `public.businesses`; both were created with `revoke all ... from anon,
 * authenticated` in 20260925225227 and both are deny-all under RLS with zero
 * policies since 20260928184943.
 *
 * They are listed here as literals rather than derived from a grant/revoke
 * replay because the invariant is stated in terms of the tables a reader can
 * name. The replay that proves the state is unchanged is the last test in the
 * file; this list is the premise that replay checks.
 */
const GATED_TABLES = ['business_finance', 'business_moderation'] as const;

/**
 * Removes SQL comments, string-aware, so a phrase in a migration header can
 * never satisfy — or break — a structural assertion.
 *
 * This is not decoration. `20260928161526` lines 90-94 explain the executor
 * startup check in prose that contains the words `CREATE POLICY`, and a naive
 * `create policy ... ;` scan swallows the rest of that paragraph and reports
 * the policy bug still being present. Every migration in this directory has a
 * long explanatory header, and 20260929010149 spends its first twenty lines
 * describing the very subquery it removes, so an unstripped scan of the ledger
 * finds the bug it is supposed to prove is gone.
 *
 * Dollar-quoted regions are entered and re-scanned on the inside rather than
 * copied wholesale: function bodies carry their own line comments (and
 * `20260929010149` keeps a helper in `pg_temp`), and a comment inside a body
 * must not be able to fake a table reference either.
 *
 * This is a single linear pass. That is a performance requirement, not a
 * style preference: this runs over every one of the 122 files in the
 * directory, ~510k characters in total. A scan that re-slices the remaining
 * input on every character — `sql.slice(i)` inside the loop — is quadratic, and
 * at this input size that is ~1.3e11 character allocations, hundreds of
 * gigabytes of string churn. It saturates memory and CPU long before it
 * produces an answer. Every branch below therefore advances a plain integer
 * index over the original string, and the only slices taken are bounded by a
 * matched region.
 */
function stripSqlComments(sql: string): string {
  const n = sql.length;
  let out = '';
  let i = 0;

  while (i < n) {
    const ch = sql[i];

    // Single-quoted literal, preserved verbatim. '' is an escaped quote and not
    // a terminator, which is why the scan steps over it instead of ending the
    // literal at the first quote it meets.
    if (ch === "'") {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          closed = true;
          break;
        }
        j += 1;
      }
      // An unterminated literal swallows the rest of the file. That is what
      // Postgres does with it too, so keep it rather than guessing.
      out += sql.slice(i, closed ? j : n);
      i = closed ? j : n;
      continue;
    }

    // Dollar-quoted region: recurse into the body so comments inside a body are
    // stripped while string literals inside that body survive. The recursion
    // partitions the input, so the total work stays linear across the file.
    if (ch === '$') {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(sql[j] as string)) j += 1;

      if (j < n && sql[j] === '$') {
        const tag = sql.slice(i, j + 1);
        const close = sql.indexOf(tag, j + 1);
        if (close === -1) {
          out += tag + stripSqlComments(sql.slice(j + 1));
          i = n;
        } else {
          out += tag + stripSqlComments(sql.slice(j + 1, close)) + tag;
          i = close + tag.length;
        }
        continue;
      }
    }

    if (ch === '-' && sql[i + 1] === '-') {
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? n : nl;
      out += '\n';
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2);
      i = close === -1 ? n : close + 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

interface Migration {
  readonly file: string;
  /** Position in replay order; see MIGRATION_FILES. */
  readonly index: number;
  /** Comment-stripped source. */
  readonly sql: string;
}

const MIGRATIONS: Migration[] = MIGRATION_FILES.map((file, index) => ({
  file,
  index,
  sql: stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), 'utf8')),
}));

/** Every migration concatenated in replay order, comments stripped. */
const LEDGER: string = MIGRATIONS.map((m) => m.sql).join('\n');

function migration(file: string): Migration {
  const found = MIGRATIONS.find((m) => m.file === file);
  if (!found) {
    throw new Error(`Migration not found: ${file}`);
  }
  return found;
}

function sqlOf(file: string): string {
  return migration(file).sql;
}

interface FunctionDefinition {
  readonly name: string;
  readonly file: string;
  readonly index: number;
  /** Signature through the `as` clause: LANGUAGE, STABLE, SECURITY, search_path. */
  readonly head: string;
  /** The dollar-quoted body exactly as written. */
  readonly body: string;
  /**
   * Postgres defaults a function to SECURITY INVOKER, so the absence of the
   * keyword IS the invoker state. Treating an unmarked function as "unknown"
   * would exempt the four that broke.
   */
  readonly definer: boolean;
}

const FUNCTION_START =
  /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(/gi;

/** Body tag after a signature. Module-level so it can be reset per use. */
const afterTag = /\$(\w*)\$/g;

/**
 * Every function definition in the ledger, in replay order.
 *
 * The body is taken between the first dollar-quote after the signature and its
 * closing quote. For a function definition that is the body tag, and nothing
 * else can sit between a signature and its own body — the `do $$` blocks that
 * share the tag shape start with `do`, not `create function`.
 */
function functionDefinitions(): FunctionDefinition[] {
  const found: FunctionDefinition[] = [];
  for (const m of MIGRATIONS) {
    for (const match of m.sql.matchAll(FUNCTION_START)) {
      const name = match[1];
      if (name === undefined) {
        continue;
      }
      const after = match.index + match[0].length;
      // `g`, not `y`, and not `m.sql.slice(after)`. The body tag does NOT sit
      // immediately after the signature — a SQL function has its `RETURNS`,
      // `LANGUAGE`, volatility and `search_path` clauses in between, so the
      // search has to go FORWARD from `after`. A sticky match would find
      // nothing and silently drop every definition in the ledger, which is
      // exactly the shape a passing-but-blind scan has. The `g` flag starts at
      // `lastIndex` and walks forward without copying the tail; the `slice`
      // this replaces copied the remaining ~510k characters once per
      // definition.
      afterTag.lastIndex = after;
      const tag = afterTag.exec(m.sql);
      afterTag.lastIndex = 0;
      if (!tag) {
        continue;
      }
      const start = m.sql.indexOf(tag[0], after);
      const end = m.sql.indexOf(tag[0], start + tag[0].length);
      if (end === -1) {
        continue;
      }
      found.push({
        name,
        file: m.file,
        index: m.index,
        head: m.sql.slice(match.index, start),
        body: m.sql.slice(start + tag[0].length, end),
        definer: /security\s+definer/i.test(m.sql.slice(match.index, start)),
      });
    }
  }
  return found;
}

const DEFINITIONS: FunctionDefinition[] = functionDefinitions();

/** The definition a target environment actually holds for a function name. */
function latestDefinitionOf(name: string): FunctionDefinition {
  const all = DEFINITIONS.filter((d) => d.name === name);
  const last = all[all.length - 1];
  if (!last) {
    throw new Error(`No definition of ${name} in the ledger`);
  }
  return last;
}

/** Every `create policy` in the ledger, with the policy text only. */
function policyBodies(): { file: string; policy: string }[] {
  const policies: { file: string; policy: string }[] = [];
  for (const m of MIGRATIONS) {
    for (const match of m.sql.matchAll(/create\s+policy\b[\s\S]*?;/gi)) {
      policies.push({ file: m.file, policy: match[0] });
    }
  }
  return policies;
}

/** True when a body reads one of the gated tables by name. */
function readsGatedTable(sql: string): boolean {
  return GATED_TABLES.some((t) =>
    new RegExp(`from\\s+public\\.${t}\\b`, 'i').test(sql),
  );
}

interface RewritePair {
  readonly fn: string;
  /** The `*_pred` constant the pattern is spelled in, for a readable failure. */
  readonly constant: string;
  /** The search text, with the `chr(10)` newlines and the doubled quotes
   *  resolved: this must be the body text BYTE FOR BYTE. */
  readonly from: string;
  readonly to: string;
}

/**
 * Reconstructs the search/replacement pairs 20260929010149 hands to
 * `pg_temp.apply_rewrite`.
 *
 * The migration spells the patterns as a concatenation over `nl` with `''`
 * escaped quotes, so the literals in the file are not the text that gets
 * searched for. Reassembling them here is the only way to assert that the
 * pattern is the body text: a reformatted body, or a re-indented pattern,
 * makes the two differ, and the migration's own `position(...) = 0` guard
 * turns that into a loud abort on apply. Without this test the abort is the
 * first place anyone finds out.
 */
function rewritePairs(): RewritePair[] {
  const sql = sqlOf(ROUTING_MIGRATION);
  const constants = new Map<string, string>();
  for (const match of sql.matchAll(
    /(\w+_pred)\s+constant text\s*:=\s*([\s\S]*?);/g,
  )) {
    const name = match[1];
    const expression = match[2];
    if (name === undefined || expression === undefined) {
      continue;
    }
    let text = '';
    for (const part of expression.split('||').map((p) => p.trim())) {
      if (part === 'nl') {
        text += '\n';
        continue;
      }
      const literal = /^'([\s\S]*)'$/.exec(part);
      if (!literal || literal[1] === undefined) {
        continue;
      }
      text += literal[1].replace(/''/g, "'");
    }
    constants.set(name, text);
  }

  const pairs: RewritePair[] = [];
  const calls = /apply_rewrite\('(\w+)',\s*array\[(\w+),\s*'((?:[^']|'')*)'\]/g;
  for (const match of sql.matchAll(calls)) {
    const fn = match[1];
    const constant = match[2];
    const to = match[3];
    if (fn === undefined || constant === undefined || to === undefined) {
      continue;
    }
    pairs.push({
      fn,
      constant,
      from: constants.get(constant) ?? '',
      to: to.replace(/''/g, "'"),
    });
  }
  return pairs;
}

const REWRITE_PAIRS: RewritePair[] = rewritePairs();

describe('the four client-facing catalog RPCs', () => {
  test('the routing migration exists, and it exists to fix exactly this', () => {
    const sql = sqlOf(ROUTING_MIGRATION);
    // Named in the header rather than inferred: the four functions are the
    // blast radius of a specific mistake, and the blast radius is worth
    // stating. A fifth name appearing here is a review checkpoint.
    for (const name of ROUTED_FUNCTIONS) {
      expect(sql).toContain(name);
    }
    // And it is a transaction: a rewrite that half applied would leave the
    // catalog in a state no definition describes.
    expect(sql).toMatch(/^\s*begin;/im);
    expect(sql).toMatch(/^\s*commit;/im);
  });

  test('each of the four is SECURITY INVOKER and still carries the inline subquery in the ledger', () => {
    // This asserts the pre-fix state on purpose. The last literal definition of
    // these four is the text 20260929010149 rewrites, so it MUST still contain
    // the subquery: a ledger where it does not would mean the body was
    // re-emitted somewhere and the routing migration's search pattern no
    // longer matches anything.
    //
    // The file each one is last defined in is pinned too, because "the last
    // definition" is a fact that changes. A new migration redefining
    // active_offers_near with the inline predicate still in it is exactly the
    // regression this directory cannot see otherwise, and the pin turns that
    // into a diff on one line instead of a silent exemption below.
    const expected: Record<string, string> = {
      active_businesses_near:
        '20260928044518_active_businesses_near_require_approved_business.sql',
      active_offer_category_counts:
        '20260928041322_explore_aggregates_require_approved_business.sql',
      active_offers_near: '20260928041036_explore_search_escape_wildcards.sql',
      popular_zones:
        '20260928041322_explore_aggregates_require_approved_business.sql',
    };

    for (const name of ROUTED_FUNCTIONS) {
      const definition = latestDefinitionOf(name);
      expect(definition.file, `${name} moved`).toBe(expected[name]);
      expect(definition.definer, `${name} must be invoker-owned`).toBe(false);
      expect(readsGatedTable(definition.body)).toBe(true);
    }
  });

  test('the routing migration swaps that exact predicate for the helper in all four', () => {
    // The link the fix depends on: the string the migration searches for IS the
    // string in the body, down to the indentation that pg_get_functiondef emits.
    // active_businesses_near gates on the `bv` alias and the other three on
    // `b`; a pattern that dropped the alias would not match its own body.
    expect(REWRITE_PAIRS.length).toBe(ROUTED_FUNCTIONS.length);

    for (const pair of REWRITE_PAIRS) {
      const body = latestDefinitionOf(pair.fn).body;
      const alias = /m\.business_id = (\w+)\.id/.exec(pair.from)?.[1];
      expect(
        alias,
        `${pair.fn}: no id alias in ${pair.constant}`,
      ).toBeDefined();
      expect(
        body.includes(pair.from),
        `${pair.fn}: ${ROUTING_MIGRATION} searches for a predicate the body does not contain`,
      ).toBe(true);
      // The replacement is the alias AND its `.id`: the helper takes a business
      // id, and the predicate it replaces correlated `m.business_id` against
      // `<alias>.id`. Asserting the bare alias here would have accepted a
      // migration that passed an alias where an id belongs, which is a type
      // error at best and a wrong boolean at worst.
      expect(pair.to).toBe(`public.business_is_approved(${alias}.id)`);
    }
  });

  test('the routing migration covers the four functions and nothing else', () => {
    const routed = REWRITE_PAIRS.map((p) => p.fn).sort();
    expect(routed).toEqual(ROUTED_FUNCTIONS);
    // One predicate per function. Two pairs on the same function would mean the
    // swap is doing more than the one predicate the header describes, and the
    // helper only accepts exactly one overload per name, so a fifth rewrite
    // would abort rather than apply.
    for (const name of ROUTED_FUNCTIONS) {
      expect(REWRITE_PAIRS.filter((p) => p.fn === name).length).toBe(1);
    }
  });

  test('a reformatted predicate aborts the migration instead of silently doing nothing', () => {
    // The patterns are spelled with chr(10) because the newlines and the
    // indentation are the fragile part. A reformatted body is a pattern that no
    // longer matches, and the migration's only defence is raising rather than
    // finishing quietly.
    const sql = sqlOf(ROUTING_MIGRATION);
    expect(sql).toMatch(/\bnl\s+constant text\s*:=\s*chr\(10\)/);
    expect(sql).toMatch(/position\(p_pairs\[v_i \* 2 - 1\] in v_new\) = 0/);
    expect(sql).toMatch(/raise exception\s*\n?\s*'patron no encontrado/);
    // An overload the migration did not expect is the other silent no-op.
    expect(sql).toMatch(/if v_count <> 1 then/);
  });

  test('the routing migration refuses to apply unless both client roles can execute the helper', () => {
    // Without this the rewrite succeeds and produces four functions that fail
    // with `42501 permission denied for function` instead of `for table` — the
    // same outage, one indirection further away from the cause.
    const sql = sqlOf(ROUTING_MIGRATION);
    for (const role of ['anon', 'authenticated']) {
      expect(sql).toMatch(
        new RegExp(
          `has_function_privilege\\('${role}',\\s*'public\\.business_is_approved\\(uuid\\)', 'execute'\\)`,
        ),
      );
    }
    expect(sql).toMatch(
      /if not \(coalesce\(v_anon, false\) and coalesce\(v_auth, false\)\) then/,
    );
    expect(sql).toMatch(
      /Apply 20260928161526_add_business_moderation_catalog_gate/,
    );
  });

  test('the routing migration aborts if any of the four keeps the subquery afterwards', () => {
    // This is the only check in the whole chain that observes the post-rewrite
    // body, because the post-rewrite body exists only in `pg_proc`. It is
    // asserted here for the property it protects: it counts leftovers across
    // all four names, so a swap that matched nothing for one of them is caught.
    const sql = sqlOf(ROUTING_MIGRATION);
    const guard = sql.match(/select count\(\*\) into v_leftovers[\s\S]*?\$\$;/);
    expect(guard?.[0]).toBeDefined();
    for (const name of ROUTED_FUNCTIONS) {
      expect(guard?.[0]).toContain(name);
    }
    expect(guard?.[0]).toMatch(
      /prosrc like '%from public\.business_moderation%'/,
    );
    expect(guard?.[0]).toMatch(/if v_leftovers > 0 then/);
  });

  test('the routing migration is a no-op on what the catalog returns', () => {
    // The swap replaces one predicate with an equivalent one, so the second
    // guard re-measures the gate: if any active business is unapproved, the
    // rewrite would make it visible and the migration must not apply. This is
    // the same measurement 20260928161526 made before gating the policy, and
    // it is why this migration restores reachability without changing the
    // result set.
    const sql = sqlOf(ROUTING_MIGRATION);
    expect(sql).toMatch(
      /from public\.businesses b\s*\n\s*where b\.is_active and not public\.business_is_approved\(b\.id\)/,
    );
    expect(sql).toMatch(/if v_unapproved > 0 then/);
  });
});

describe('public.business_is_approved is the only door to the moderation table', () => {
  test('the helper is SECURITY DEFINER with an empty search_path and a qualified body', () => {
    // SECURITY DEFINER is the whole point: it is the only reason the predicate
    // can name business_moderation at all, because the permission check then
    // runs against the owner instead of the caller. The empty search_path is
    // the standard definer hardening, and it is safe here only because the body
    // fully qualifies everything it names.
    const definition = latestDefinitionOf('business_is_approved');
    expect(definition.file).toBe(GATE_MIGRATION);
    expect(definition.definer).toBe(true);
    expect(definition.head).toMatch(/set search_path = ''/i);
    expect(definition.body).toMatch(/from public\.business_moderation m/);
    // Nothing in the body may be resolved through the search_path. With
    // `search_path = ''` an unqualified name does not resolve to `public`, it
    // fails to resolve at all, so every table the body names must carry its
    // schema.
    expect(definition.body).not.toMatch(/from\s+(?!public\.)/i);
    expect(definition.body).not.toMatch(/(?<!public\.)business_moderation/i);
    expect(definition.body).not.toMatch(/(?<!public\.)business_finance/i);
  });

  test('the helper states the intended surface explicitly on both sides', () => {
    // The revoke is load-bearing, not hygiene: a new public function is NOT
    // executable by anyone in production, because
    // 20260507215323_harden_phase2_security_surface.sql revoked EXECUTE from
    // PUBLIC, anon and authenticated and set a default privilege. The grant is
    // what makes the policy reachable at all.
    const sql = sqlOf(GATE_MIGRATION);
    expect(sql).toMatch(
      /revoke all on function public\.business_is_approved\(uuid\)\s*\n\s*from public, anon, authenticated;/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.business_is_approved\(uuid\) to anon, authenticated;/i,
    );
  });

  test('the catalog policy calls the helper instead of inlining the subquery', () => {
    // The policy is the historical instance of this bug: the inline form was
    // written, measured, and rejected, and the commit that shipped the gate
    // already used the helper. The broken spelling never reached the ledger, so
    // this assertion cannot be credited with catching it — what it does is
    // stop the next author from shipping it, and it records that the policy
    // keeps `is_active`: the curtain and the lock are two conditions.
    // The LAST definition, not the first. A policy is recreated under the same
    // name whenever its predicate changes, and the original predates the gate
    // by a long way — taking the first match would have asserted against a
    // policy the database replaced long ago, and would have passed while the
    // live one said something else. This is the same replay-position rule
    // `latestDefinitionOf` applies to function bodies.
    const policy = policyBodies().findLast((p) =>
      p.policy.includes('"Anyone can view active businesses"'),
    );
    expect(policy?.file).toBe(GATE_MIGRATION);
    expect(policy?.policy).toMatch(
      /public\.business_is_approved\(businesses\.id\)/,
    );
    expect(policy?.policy).toMatch(/is_active = true/);
    expect(readsGatedTable(policy?.policy ?? '')).toBe(false);
  });
});

describe('no client role holds a privilege on the two companion tables', () => {
  test('the companions were created closed, and nothing in the ledger ever opened them', () => {
    // The security half of the fix, and the reason the fix was not "grant SELECT
    // on business_moderation to anon". That escape works — the subquery resolves
    // — and it hands `anon` a direct read of every moderation row, which is the
    // split phase 3 exists to create. The zero-privilege state is what makes
    // the table a trustworthy anchor in the first place.
    //
    // So the assertion is over EVERY grant in the ledger, not over the two
    // migrations this bug touched: the failure mode is a grant added later, in
    // an unrelated file, to make some other symptom go away.
    const grants = [...LEDGER.matchAll(/\bgrant\b[^;]*;/gi)]
      .map((m) => m[0])
      .filter((g) => GATED_TABLES.some((t) => g.includes(t)));
    expect(grants).toEqual([
      'grant all on public.business_finance to service_role;',
      'grant all on public.business_moderation to service_role;',
    ]);
  });

  test('no client role is named in any grant or revoke that would leave a privilege behind', () => {
    // The same scan from the other side, stated as a property rather than as an
    // expected list: no statement anywhere in the ledger may hand a client role
    // anything on a companion table, in any privilege list, column list or
    // `grant ... on all tables in schema` shape.
    for (const statement of LEDGER.matchAll(/\bgrant\b[^;]*;/gi)) {
      const grant = statement[0];
      if (!GATED_TABLES.some((t) => grant.includes(t))) {
        continue;
      }
      for (const role of ['anon', 'authenticated']) {
        expect(
          new RegExp(`to\\s+(public,\\s*)?${role}\\b`, 'i').test(grant),
          `client role ${role} is named in: ${grant}`,
        ).toBe(false);
      }
    }
  });

  test('the companions are deny-all under RLS with no policies, which is the second layer', () => {
    // Either layer alone leaves a hole: a grant that lands on a table whose RLS
    // was never recorded opens it. 20260928184943 is the ALTER the ledger was
    // missing for these two, and it states the asymmetry in its own header —
    // the companions are closed twice, `app_store` only once.
    const sql = sqlOf(RLS_ON_UNRECORDED_MIGRATION);
    for (const table of GATED_TABLES) {
      expect(sql).toMatch(
        new RegExp(
          `alter table if exists public\\.${table} enable row level security;`,
        ),
      );
    }
    expect(sql).toMatch(/revoke truncate, trigger, references on table/);
    // The original zero-privilege statement, still in force.
    const created = sqlOf(COMPANION_TABLES_MIGRATION);
    for (const table of GATED_TABLES) {
      expect(created).toMatch(
        new RegExp(`revoke all on public\\.${table} from anon, authenticated;`),
      );
    }
    // A policy on either companion would make it readable again through the
    // deny-all, so zero policies is part of the state, not a footnote.
    for (const policy of policyBodies()) {
      if (
        !/on public\.(business_finance|business_moderation)\b/.test(
          policy.policy,
        )
      ) {
        continue;
      }
      expect(
        policy.policy,
        `${policy.file}: a companion table has a policy`,
      ).not.toMatch(/for select/i);
    }
  });
});

/**
 * ─── The invariant this whole class of bug violates ────────────────────────
 *
 * Postgres checks a function body's table privileges at EXECUTOR STARTUP, as
 * the invoking role, before any row is examined and regardless of which branch
 * of the result finally decides anything. An RLS policy qual is checked the
 * same way. So a SECURITY INVOKER function in `public` that inlines a subquery
 * against a table no client role can read is not "over-restrictive" — it is
 * dead to every client role, uniformly, for anon, a member, an admin and an
 * owner alike. `CREATE FUNCTION` and `CREATE POLICY` both still succeed, which
 * is what makes the shape dangerous: the ledger replays green and the outage
 * begins on the first client read.
 *
 * A SECURITY DEFINER function is checked against the OWNER instead, so the same
 * subquery is sound there. That is the entire split, and it is why the blast
 * radius of this bug was exactly four functions: nine bodies in the ledger name
 * `business_moderation` (asserted below), three of them are owned by a trigger
 * or by the admin surface and run as the owner, and four were SECURITY INVOKER
 * and belonged to the public catalog.
 *
 * The scan covers every migration, forever, and it exempts exactly the four
 * functions the routing migration rewrites — derived from that migration, and
 * only while nothing has redefined them since. That derivation is the part that
 * matters: a hardcoded exemption list is a list that eventually forgives
 * something, and the replay-position check means re-adding the inline predicate
 * to one of the four in a later migration is a violation again, not an
 * inherited pass.
 */
describe('an invoker-owned body never inlines a subquery against a gated table', () => {
  test('the ledger names a gated table in six function bodies, and four of them are invoker-owned', () => {
    // Pinned so an empty result below cannot be confused with a parser that
    // stopped matching. `[]` is also what a directory that failed to load, or a
    // dollar-quote that did not close, looks like; the count is what
    // disambiguates it, exactly as enable-rls.rls.db.spec.ts pins 39/39 beside
    // its empty set.
    const referencing = DEFINITIONS.filter((d) => readsGatedTable(d.body));
    // `bootstrap_business_companions` is deliberately NOT in either list, and
    // the reason is worth keeping in the file: it names both companion tables,
    // but it WRITES them (`insert into public.business_moderation ...`), under
    // SECURITY DEFINER, on behalf of whoever inserted a business. That is the
    // design working, not the bug. The trap this test guards is a READ reached
    // through a policy qual or an invoker-owned body, which Postgres
    // permission-checks as the caller before any row is examined. A definer
    // trigger's own write is checked against the owner and is sound, so
    // counting it here would have widened the scan to cover a failure mode that
    // cannot occur — and the next author would have had to work out whether to
    // exempt it.
    expect(referencing.map((d) => d.name).sort()).toEqual([
      'active_businesses_near',
      'active_offer_category_counts',
      'active_offers_near',
      'business_is_approved',
      'notify_business_pending',
      'popular_zones',
    ]);
    // And the shape that made the split: the same subquery, sound under an
    // owner and fatal under a caller.
    expect(
      referencing
        .filter((d) => d.definer)
        .map((d) => d.name)
        .sort(),
    ).toEqual(['business_is_approved', 'notify_business_pending']);
  });

  test('every gated-table reference reachable by a client role goes through the helper', () => {
    const routingIndex = migration(ROUTING_MIGRATION).index;
    const violations: string[] = [];
    const exempted: string[] = [];

    for (const definition of DEFINITIONS) {
      if (definition.definer || !readsGatedTable(definition.body)) {
        continue;
      }
      // A function is exempt only while the routing migration is strictly
      // later than the last literal definition of that name. Reverse either
      // half and the exemption is void: a redefined body re-enters the scan,
      // and a deleted routing migration re-opens the four.
      const lastDefinition = DEFINITIONS.filter(
        (d) => d.name === definition.name,
      ).pop();
      const isRouted =
        REWRITE_PAIRS.some((p) => p.fn === definition.name) &&
        lastDefinition !== undefined &&
        routingIndex > lastDefinition.index;

      if (isRouted) {
        exempted.push(definition.name);
        continue;
      }
      violations.push(
        `${definition.file}: ${definition.name} is SECURITY INVOKER and reads a gated table inline`,
      );
    }

    expect(
      violations,
      'a SECURITY INVOKER function in public inlines a subquery against a table no client role can read; it will raise 42501 permission denied for table at executor startup, for every client role, and the DDL will still apply',
    ).toEqual([]);
    // The empty set above is ambiguous between "clean" and "the exemption grew
    // to cover everything". These four are the whole exemption, asserted.
    expect([...new Set(exempted)].sort()).toEqual(ROUTED_FUNCTIONS);
  });

  test('no RLS policy in the ledger reads a gated table inline', () => {
    // The other half of the invariant, and the half with the better story: the
    // inline policy was written, measured, and never shipped. The commit that
    // added the catalog gate already routed through the helper, so this
    // assertion is not the reason that bug was caught and is not credited with
    // it. What it does is make the next spelling a failing test instead of an
    // outage that starts on the first client read, admin panel included.
    const offending = policyBodies()
      .filter((p) => readsGatedTable(p.policy))
      .map((p) => `${p.file}: ${p.policy.replace(/\s+/g, ' ').slice(0, 120)}`);
    expect(
      offending,
      'an RLS policy qual is permission-checked as the querying role at executor startup, before any row is examined and regardless of which ORed policy decides the row; the whole table becomes unreadable to every client role and CREATE POLICY still succeeds',
    ).toEqual([]);
  });
});
