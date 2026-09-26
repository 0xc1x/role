import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';

/**
 * The corrective migration is the enforcement point for the client data
 * boundary. These tests pin its intent against the migration source so a later
 * edit cannot silently reopen a hole without a reviewer noticing.
 */
const MIGRATION_PATH = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
  '20260925163235_client_read_boundaries_vault_secrets.sql',
);
const MIGRATION: string = readFileSync(MIGRATION_PATH, 'utf8');

/**
 * Every migration in filename order, concatenated. Several invariants below are
 * only true of the *cumulative* result: the dispatcher allowlist and the secret
 * provisioning were extended by later migrations, and the header-transport fix
 * supersedes the body the first boundary migration shipped.
 */
const MIGRATIONS_DIR = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
);
const ALL_MIGRATIONS: string = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  .join('\n');

const EDGE_FUNCTIONS_DIR = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  '..',
  'supabase',
  'functions',
);
/** Internal functions authenticated by the shared dispatch secret. */
const INTERNAL_EDGE_FUNCTIONS = [
  'handle-order-event/index.ts',
  'handle-pickup-reminders/index.ts',
  'handle-weekly-summary/index.ts',
  'dispatch-nearby-offers/index.ts',
  'handle-offer-created/index.ts',
];

/** Statement-scoped helpers keep failure output readable (not the whole file). */
function statements(): string[] {
  return MIGRATION.split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

function findStatement(predicate: (s: string) => boolean): string {
  const match = statements().find(predicate);
  if (!match) {
    throw new Error(
      `No migration statement matched. Statements:\n${statements().join(';\n')}`,
    );
  }
  return match;
}

/** Content of the first `grant select (...)` block for a table. */
function grantBlock(table: string): string {
  const statement = findStatement((s) =>
    new RegExp(`grant select \\([\\s\\S]*?on table public\\.${table} to `, 'i').test(
      s,
    ),
  );
  const body = statement.match(/grant select \(([\s\S]*?)\) on table/);
  return body ? body[1] : '';
}

describe('client read/write boundary migration', () => {
  test('order_events: client writes are revoked and insert policies dropped', () => {
    const revoke = findStatement((s) =>
      /revoke insert, update, delete, truncate on table public\.order_events from anon, authenticated/i.test(
        s,
      ),
    );
    expect(revoke).toMatch(/public\.order_events/);

    expect(MIGRATION).toMatch(
      /drop policy if exists "Users can insert own order events" on public\.order_events/i,
    );
    expect(MIGRATION).toMatch(
      /drop policy if exists "Business can insert own order events" on public\.order_events/i,
    );
    // SELECT policies must survive: the app still needs to read its own events.
    expect(MIGRATION).not.toMatch(
      /drop policy if exists "Users can view own order events"/i,
    );
  });

  test('businesses: table-level SELECT is required, and phase 3 must close what it exposes', () => {
    // 20260925163235 replaced table-wide SELECT with per-column grants so anon
    // could not read the platform columns. That is incompatible with PostgREST:
    // offers, business_locations and orders hold foreign keys to businesses, and
    // PostgREST needs table-level SELECT on a referenced table to resolve
    // relationships, so every /rest/v1/offers read failed with 42501 - including
    // select=id with no embed. The offers catalog is the product.
    //
    // The two are mutually exclusive: either the table is exposed, or the
    // sensitive columns move off it. Phase 1 created the companion tables,
    // phase 2 repointed the application at them, and phase 3 drops the columns.
    // The restore below is not a regression to undo: without table-level SELECT
    // the catalog does not load at all.
    const restore = [
      ...ALL_MIGRATIONS.matchAll(
        /grant select on table public\.businesses to anon, authenticated;/gi,
      ),
    ];
    expect(
      restore.length,
      'no migration restores table-level SELECT on businesses',
    ).toBeGreaterThan(0);

    // While the columns are still on the table they ARE readable by anon. This
    // assertion is the debt marker: it fails the day someone re-hides them with
    // a column grant and breaks the offers catalog again, and it is removed only
    // when phase 3 has actually been applied to the database.
    expect(ALL_MIGRATIONS).toMatch(
      /EXPOSED TO ANON[\s\S]*commission_rate[\s\S]*balance[\s\S]*verification_status/i,
    );

    // Row access stays bounded by RLS throughout: anon only reaches active
    // businesses, so the exposure was never unbounded, only too wide.
    expect(ALL_MIGRATIONS).toMatch(/Row access is still bounded by RLS/i);
  });

  test('offers: computed rating columns are excluded from client write grants', () => {
    const revoke = findStatement((s) =>
      /revoke insert, update, delete, truncate[^;]*on table public\.offers from anon, authenticated/i.test(
        s,
      ),
    );
    expect(revoke).toMatch(/offers/);
    // The over-broad grant also carried TRUNCATE/TRIGGER/REFERENCES.
    expect(revoke).toMatch(/truncate, trigger, references/i);

    const insertGrant = findStatement((s) =>
      /grant insert \([\s\S]*?on table public\.offers to authenticated/i.test(s),
    );
    const updateGrant = findStatement((s) =>
      /grant update \([\s\S]*?on table public\.offers to authenticated/i.test(s),
    );
    for (const column of ['rating', 'review_count']) {
      expect(insertGrant).not.toContain(column);
      expect(updateGrant).not.toContain(column);
    }
    // Stock is moved by the reservation RPCs, never by an owner editing an offer.
    expect(updateGrant).not.toMatch(/\bstock\b/);
    expect(MIGRATION).toMatch(/revoke update \(stock\) on table public\.offers/i);
  });

  test('offers: the missing FK index is added', () => {
    expect(
      findStatement((s) =>
        /create index if not exists idx_offers_location_business/i.test(s),
      ),
    ).toMatch(/on public\.offers using btree \(business_location_id, business_id\)/i);
  });

  test('get_platform_stats is definer with a fixed empty search_path and service_role only', () => {
    const fn = statements()
      .join(';\n')
      .match(
        /create or replace function public\.get_platform_stats\(\)[\s\S]*?\$\$;/i,
      )?.[0];
    expect(fn).toMatch(/security definer/i);
    expect(fn).toMatch(/set search_path = ''/i);
    // Every client role is revoked individually.
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(
        findStatement((s) =>
          new RegExp(
            `revoke all on function public\\.get_platform_stats\\(\\) from ${role}`,
            'i',
          ).test(s),
        ),
      ).toMatch(/get_platform_stats/);
    }
    expect(
      findStatement((s) =>
        /grant execute on function public\.get_platform_stats\(\) to service_role/i.test(
          s,
        ),
      ),
    ).toMatch(/service_role/);
  });

  test('a count-only public aggregate replaces the client stats call', () => {
    const fn = statements()
      .join(';\n')
      .match(
        /create or replace function public\.get_platform_public_stats\(\)[\s\S]*?\$\$;/i,
      )?.[0];
    expect(fn).toMatch(/security definer/i);
    expect(fn).toMatch(/set search_path = ''/i);
    expect(
      findStatement((s) =>
        /grant execute on function public\.get_platform_public_stats\(\) to anon, authenticated/i.test(
          s,
        ),
      ),
    ).toMatch(/get_platform_public_stats/);
  });

  test('no secret literal is embedded in the migration', () => {
    expect(MIGRATION).not.toMatch(/['"][0-9a-f]{64}['"]/i);
    expect(MIGRATION).not.toMatch(/['"]eyJ[A-Za-z0-9_-]{20,}/);
    // The shared secret must be sourced from Vault, never compared to a literal.
    expect(MIGRATION).toMatch(/x-internal-secret/);
    expect(MIGRATION).not.toMatch(
      /x-internal-secret["']?\s*,\s*['"][0-9a-f]{16,}/i,
    );
    // Rotation is generated, not copied from the legacy source.
    expect(MIGRATION).toMatch(
      /encode\(extensions\.gen_random_bytes\(32\), 'hex'\)/,
    );
  });

  test('the vault helper fails closed and is not exposed to client roles', () => {
    const fn = statements()
      .join(';\n')
      .match(
        /create or replace function public\.invoke_internal_edge_function\([\s\S]*?\$\$;/i,
      )?.[0];
    expect(fn).toMatch(/vault\.decrypted_secrets/);
    expect(fn).toMatch(/raise exception/i);
    expect(fn).toMatch(/net\.http_post/);
    // Caller-controlled path must not become an arbitrary endpoint.
    expect(fn).toMatch(/path not in \(/i);

    for (const role of ['public', 'anon', 'authenticated']) {
      expect(
        findStatement((s) =>
          new RegExp(
            `revoke all on function public\\.invoke_internal_edge_function\\(text, jsonb\\) from ${role}`,
            'i',
          ).test(s),
        ),
      ).toMatch(/invoke_internal_edge_function/);
    }
  });

  test('the dispatcher passes headers as headers, not as query params', () => {
    // Regression guard for a silent, total notification outage.
    //
    // pg_net's signature is
    //   net.http_post(url, body, params, headers, timeout_milliseconds)
    // and `params` is the query string. An earlier dispatcher passed its header
    // map as params := jsonb_build_object('headers', ...), so NO HTTP header was
    // ever attached. Because the functions are verify_jwt:false the gateway
    // still forwarded the request, so every dispatch failed 401 Unauthorized -
    // which reads exactly like a wrong or non-injected secret and points the
    // investigation at the wrong subsystem.
    // The *effective* definition is the last `create or replace` in filename
    // order. Earlier migrations legitimately contain the buggy body, so
    // asserting against the first match would pin the outage in place.
    const definitions = [
      ...ALL_MIGRATIONS.matchAll(
        /create or replace function public\.invoke_internal_edge_function\([\s\S]*?\$\$;/gi,
      ),
    ];
    const fn = definitions[definitions.length - 1]?.[0];
    expect(fn).toBeDefined();

    // The credential header must go through the dedicated argument.
    expect(fn).toMatch(/headers\s*:=\s*jsonb_build_object\(/i);
    expect(fn).toMatch(/'x-internal-secret'\s*,\s*v_secret/);
    expect(fn).toMatch(/'apikey'\s*,\s*v_anon/);
    // And it must never be smuggled through the query string.
    expect(fn).not.toMatch(/params\s*:=\s*jsonb_build_object\(\s*'headers'/i);
  });

  test('dispatch auth is decided by the database, not by function env', () => {
    // The functions verify the shared secret through a SECURITY DEFINER
    // function, so the value never crosses the wire and never has to be
    // injected into the Edge runtime. The RPC must stay service_role-only:
    // exposing it to anon/authenticated would turn it into an oracle for
    // guessing the secret by repetition.
    const rpc = ALL_MIGRATIONS.match(
      /create or replace function public\.internal_dispatch_secret_matches\([\s\S]*?\$\$;/i,
    )?.[0];
    expect(rpc).toBeDefined();
    expect(rpc).toMatch(/security definer/i);
    expect(rpc).toMatch(/set search_path\s*=\s*''/i);

    for (const role of ['public', 'anon', 'authenticated']) {
      expect(ALL_MIGRATIONS).toMatch(
        new RegExp(
          `revoke all on function public\\.internal_dispatch_secret_matches\\(text\\) from ${role};`,
          'i',
        ),
      );
    }
    expect(ALL_MIGRATIONS).toMatch(
      /grant execute on function public\.internal_dispatch_secret_matches\(text\) to service_role;/i,
    );

    // No function may compare the secret in-process against its own env.
    for (const file of INTERNAL_EDGE_FUNCTIONS) {
      const source = readFileSync(join(EDGE_FUNCTIONS_DIR, file), 'utf8');
      expect(source).not.toMatch(/Deno\.env\.get\("INTERNAL_SECRET"\)/);
      expect(source).toMatch(/isInternalDispatch\(/);
    }
  });

  test('a fresh environment fails closed instead of deploying a broken dispatcher', () => {
    const block = statements()
      .join(';\n')
      .match(/do \$\$[\s\S]*?\$\$;/i)?.[0];
    expect(block).toMatch(/legacy_src is null/i);
    expect(block).toMatch(/vault\.decrypted_secrets/);
    expect(block).toMatch(/raise exception/i);
  });

  test('the fresh-environment path still syncs the seeded secret to the functions', () => {
    // Section 0 returns early on a fresh env, so the sync needs its own block;
    // otherwise an operator-seeded secret would never reach the Edge functions.
    const blocks = MIGRATION.match(/do \$\$[\s\S]*?\$\$;/gi) ?? [];
    const syncing = blocks.filter((b) => b.includes('supabase_functions_secret_'));
    expect(syncing.length).toBeGreaterThanOrEqual(2);
    for (const b of syncing) {
      expect(b).toMatch(/internal_secret missing from Vault/i);
      expect(b).toMatch(/vault\.create_secret\(/);
    }
  });

  test('the order-event trigger no longer embeds credentials', () => {
    const fn = statements()
      .join(';\n')
      .match(
        /create or replace function public\.handle_order_event_push\(\)[\s\S]*?\$\$;/i,
      )?.[0];
    expect(fn).toBeDefined();
    expect(fn).toMatch(/invoke_internal_edge_function/);
    expect(fn).toMatch(/set search_path = ''/i);
    expect(fn).not.toMatch(/x-internal-secret/);
  });

  test('the order-event trigger sends the webhook envelope the Edge Function requires', () => {
    const fn = statements()
      .join(';\n')
      .match(
        /create or replace function public\.handle_order_event_push\(\)[\s\S]*?\$\$;/i,
      )?.[0];
    expect(fn).toBeDefined();
    // The deployed handle-order-event returns { success, skipped: true } unless
    // it sees type === 'INSERT' and a record. A flattened body drops every push
    // with no error surface, so the envelope is part of the contract.
    expect(fn).toMatch(/'type',\s*'INSERT'/);
    expect(fn).toMatch(/'table',\s*'order_events'/);
    expect(fn).toMatch(/'schema',\s*'public'/);
    expect(fn).toMatch(/'record',\s*row_to_json\(new\)/);
    // The old flattened shape must be gone.
    expect(fn).not.toMatch(/'order_id',\s*new\.order_id/);
  });

  test('the allowlist uses real Edge Function slugs, not cron job names', () => {
    const fn = statements()
      .join(';\n')
      .match(
        /create or replace function public\.invoke_internal_edge_function\([\s\S]*?\$\$;/i,
      )?.[0];
    const allowlist = fn?.match(/if path not in \(([\s\S]*?)\) then/i)?.[1] ?? '';
    for (const slug of [
      'handle-order-event',
      'handle-pickup-reminders',
      'handle-weekly-summary',
      'dispatch-nearby-offers',
    ]) {
      expect(allowlist).toContain(slug);
    }
    // Cron job names are not endpoint slugs and would 404.
    for (const jobName of ['pickup_reminders_push', 'weekly_summary_push']) {
      expect(allowlist).not.toContain(jobName);
    }
  });

  test('the internal secret is rotated, never parsed out of the legacy source', () => {
    // A regex claiming to extract the literal could never match the current
    // source shape, so detection must be presence-only + fresh generation.
    // pgcrypto must be schema-qualified: an unqualified call fails under the
    // fixed search_path used everywhere in this migration.
    expect(MIGRATION).toMatch(
      /encode\(extensions\.gen_random_bytes\(32\), 'hex'\)/,
    );
    expect(MIGRATION).not.toMatch(/(?<!\.)encode\(gen_random_bytes/);
    expect(MIGRATION).not.toMatch(/regexp_match\([^)]*x-internal-secret/i);
    expect(MIGRATION).toMatch(/NOT parsed for a secret value/i);
  });

  test('the rotated secret is synced to all four Edge function secret entries', () => {
    for (const slug of [
      'handle-order-event',
      'handle-pickup-reminders',
      'handle-weekly-summary',
      'dispatch-nearby-offers',
    ]) {
      expect(MIGRATION).toMatch(new RegExp(`'${slug}'`, 'i'));
    }
    // One loop, the shared per-function naming convention.
    expect(MIGRATION).toContain(
      "supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET",
    );
    // Idempotent: update by id when present, create when absent.
    expect(MIGRATION).toMatch(/vault\.update_secret\(/);
    expect(MIGRATION).toMatch(/select id from vault\.secrets/);
    expect(MIGRATION).toMatch(/vault\.create_secret\(/);
  });

  test('cron commands pass the real slug while keeping the job name', () => {
    // The cron commands are dollar-quoted and contain an inner semicolon, so
    // they cannot be read through statements(); match the raw source instead.
    for (const [jobName, slug] of [
      ['pickup_reminders_push', 'handle-pickup-reminders'],
      ['weekly_summary_push', 'handle-weekly-summary'],
      ['dispatch-nearby-offers', 'dispatch-nearby-offers'],
    ]) {
      const schedule = MIGRATION.match(
        new RegExp(
          `select cron\\.schedule\\(\\s*'${jobName}'[\\s\\S]*?invoke_internal_edge_function\\('${slug}'[\\s\\S]*?\\);`,
          'i',
        ),
      )?.[0];
      expect(schedule).toBeDefined();
      expect(
        MIGRATION,
      ).toMatch(new RegExp(`select cron\\.unschedule\\('${jobName}'\\)`, 'i'));
    }
    // The migration uses the supported cron API and never edits cron.job directly.
    expect(MIGRATION).toMatch(/select cron\.unschedule\(/i);
    expect(MIGRATION).toMatch(/select cron\.schedule\(/i);
    expect(MIGRATION).not.toMatch(/alter table cron\.job/i);
  });
});

/**
 * Client write columns vs. database write grants.
 *
 * This is the regression guard for a real production break: the mobile
 * business panel built a single payload and sent it to both `.insert()` and
 * `.update()`, while the database grants INSERT and UPDATE on different column
 * sets. PostgREST forwards the whole object, so the UPDATE was rejected
 * outright with `permission denied for table offers` and *editing any offer
 * failed*, while create and delete kept working and every unit test stayed
 * green because they mock Supabase.
 *
 * The invariant: every column the client writes on UPDATE must appear in the
 * effective UPDATE grant, and the derived columns must appear in neither set.
 */
describe('offers write grants match what the client actually writes', () => {
  const MIGRATIONS_DIR = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    '..',
    '..',
    'supabase',
    'migrations',
  );
  const REPOSITORY_PATH = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    '..',
    '..',
    'apps',
    'mobile',
    'src',
    'features',
    'business',
    'data',
    'repository.ts',
  );

  /** Columns whose value Postgres derives; a client write is always a bug. */
  const DERIVED_COLUMNS = [
    'rating',
    'review_count',
    'discount_percentage',
  ] as const;

  function columnList(raw: string): string[] {
    return raw
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
  }

  /**
   * Replays every `grant/revoke update (...)` on public.offers in filename
   * order so the assertion tracks the *effective* grant, not one migration.
   */
  function effectiveUpdateGrant(): Set<string> {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const effective = new Set<string>();
    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      for (const [, verb, cols] of sql.matchAll(
        /(grant|revoke)\s+update\s*\(([^)]*)\)\s*on\s+table\s+public\.offers/gi,
      )) {
        for (const col of columnList(cols)) {
          if (verb.toLowerCase() === 'grant') effective.add(col);
          else effective.delete(col);
        }
      }
    }
    return effective;
  }

  /** Keys of the shared mutable column object in the mobile repository. */
  function clientMutableColumns(): string[] {
    const source = readFileSync(REPOSITORY_PATH, 'utf8');
    // Indentation is whitespace-agnostic on purpose: the file is formatted by
    // biome, and a guard that hardcodes "two spaces" silently breaks the day
    // the tab convention is enforced.
    const block = source.match(/const mutableColumns: Row = \{([\s\S]*?)\n[\t ]+\};/);
    if (!block?.[1]) {
      throw new Error(
        'saveOffer no longer declares a `mutableColumns: Row` object literal; update this guard to match the new shape.',
      );
    }
    const keys = columnList(
      [...block[1].matchAll(/^\s*(\w+):/gm)].map((m) => m[1] as string).join(','),
    );
    // The photo column is assigned imperatively, not in the literal.
    if (/mutableColumns\.image\s*=/.test(source)) keys.push('image');
    return keys;
  }

  /** Columns the mobile repository adds only on the insert path. */
  function clientInsertOnlyColumns(): string[] {
    const source = readFileSync(REPOSITORY_PATH, 'utf8');
    // Anchor on the spread so an unrelated .insert({...}) elsewhere in the
    // file cannot be mistaken for the offer insert.
    const spread = source.match(
      /\.insert\(\{\s*\.\.\.mutableColumns,([\s\S]*?)\n[\t ]+\}\)/,
    );
    if (!spread?.[1]) {
      throw new Error(
        'saveOffer no longer spreads mutableColumns inside .insert({...}); update this guard to match the new shape.',
      );
    }
    return [...spread[1].matchAll(/^\s*(\w+):/gm)].map(
      (m) => m[1] as string,
    );
  }

  test('every column the client writes on UPDATE is granted to authenticated', () => {
    const grant = effectiveUpdateGrant();
    const written = clientMutableColumns();

    // A missing grant is what made offer editing fail at runtime.
    const ungranted = written.filter((c) => !grant.has(c));
    expect(
      ungranted,
      `client writes these columns on UPDATE but the database does not grant UPDATE on them: ${ungranted.join(', ')}. Either narrow the client payload or grant the column in a migration.`,
    ).toEqual([]);

    // The split must actually be used: a single shared payload is the bug.
    const source = readFileSync(REPOSITORY_PATH, 'utf8');
    expect(source).toMatch(/\.update\(mutableColumns\)/);
    expect(source).not.toMatch(/\.update\(payload\)/);
  });

  test('stock stays client-writable because check_offer_expiry depends on it', () => {
    // public.check_offer_expiry() is a BEFORE UPDATE OF stock trigger that maps
    // stock -> 0 to deactivation and 0 -> >0 to reactivation. Revoking the
    // grant removes the merchant's only pause/restock control, and closes no
    // trust boundary because initial_stock is client-writable on INSERT.
    const grant = effectiveUpdateGrant();
    expect(grant.has('stock')).toBe(true);
    expect(clientMutableColumns()).toContain('stock');
  });

  test('derived columns are never written by the client', () => {
    const written = [...clientMutableColumns(), ...clientInsertOnlyColumns()];
    for (const col of DERIVED_COLUMNS) {
      expect(written, `client must not write derived column ${col}`).not.toContain(
        col,
      );
    }
  });

  test('ownership, location and opening stock are insert-only', () => {
    // These must never move on UPDATE: transferring business_id would be an
    // ownership change, and initial_stock is the opening quantity.
    const grant = effectiveUpdateGrant();
    const mutable = clientMutableColumns();
    for (const col of [
      'business_id',
      'business_location_id',
      'initial_stock',
    ]) {
      expect(grant.has(col), `${col} must not be UPDATE-granted`).toBe(false);
      expect(
        mutable,
        `${col} must not be sent on the update path`,
      ).not.toContain(col);
      expect(clientInsertOnlyColumns()).toContain(col);
    }
  });
});

/**
 * Phase 3 of the businesses column split.
 *
 * This is the closing half of finding P1-2. Phase 1 created the companion
 * tables, phase 2 repointed the API and the mobile client at them, and phase 3
 * drops the seven columns from `public.businesses`. Only after that is the
 * table-level SELECT that PostgREST requires actually safe, because the table
 * then holds nothing but public data.
 *
 * The migration is committed but NOT applied. It must not be applied until the
 * phase-2 API is deployed, so these tests pin the migration source, not the
 * live database. The debt assertion in the suite above is what still tracks
 * the live state.
 *
 * Three things went wrong while building this and are worth guarding, because
 * each one is invisible to a review that only reads the diff:
 *
 * 1. The scope was badly under-estimated twice. First "two functions", then
 *    "thirteen". The truth is ten functions, twenty RLS policies, and two
 *    triggers that had to move to another table. Seven of those policies live
 *    on tables nobody was looking at. A guard that counts them keeps the
 *    estimate honest.
 *
 * 2. `DROP COLUMN ... CASCADE` would have deleted seventeen security policies
 *    without a word. Postgres refuses the drop without CASCADE, which is the
 *    only reason this was caught at all.
 *
 * 3. The bootstrap trigger has to be AFTER INSERT. The companions have foreign
 *    keys to businesses(id) and those are validated immediately, so a BEFORE
 *    trigger fails with 23503. Nothing about reading the trigger suggests that;
 *    only running the insert does.
 */
describe('businesses column split phase 3 closes the anon exposure', () => {
  const MIGRATIONS_DIR = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    '..',
    '..',
    'supabase',
    'migrations',
  );
  const PHASE3_FILE = '20260926000011_businesses_drop_sensitive_columns.sql';
  const PHASE3_PATH = join(MIGRATIONS_DIR, PHASE3_FILE);
  const PHASE3: string = readFileSync(PHASE3_PATH, 'utf8');

  const DRIZZLE_BUSINESSES = join(
    import.meta.dir,
    '..',
    'schema',
    'businesses.ts',
  );

  /**
   * The migration with line comments stripped. Two assertions below would
   * otherwise match the prose: the header explains at length why the DROP must
   * not use CASCADE, and the rewrite helper carries the old predicates as the
   * search strings it replaces.
   */
  function sql(): string {
    return PHASE3.replace(/--[^\n]*/g, '');
  }

  /** Columns that must not survive on public.businesses. */
  const MOVED_COLUMNS = [
    'owner_id',
    'balance',
    'commission_rate',
    'verification_status',
    'verified_at',
    'verified_by',
    'rejection_reason',
  ] as const;

  test('the phase-3 migration drops every moved column and refuses CASCADE', () => {
    const drop = sql().match(/alter table public\.businesses([\s\S]*?);/i)?.[1];
    expect(drop, 'no ALTER TABLE ... DROP COLUMN on businesses').toBeDefined();

    for (const column of MOVED_COLUMNS) {
      expect(drop).toMatch(
        new RegExp(`drop column if exists ${column}\\b`, 'i'),
      );
    }

    // The single most important assertion in this file. CASCADE here would
    // silently drop seventeen ownership policies across eleven tables, turning
    // "Owners can update own offers" into a missing policy rather than an error.
    expect(drop).not.toMatch(/cascade/i);
    expect(sql()).not.toMatch(/alter table public\.businesses[\s\S]*?cascade/i);
  });

  test('the migration carries its own apply-order warning', () => {
    // Applying this before the phase-2 API ships breaks order reservation, so
    // the ordering constraint has to live in the file, not in someone's memory.
    expect(PHASE3).toMatch(/APPLY ORDER WARNING/i);
    expect(PHASE3).toMatch(/DO NOT RUN until the phase-2 API is deployed/i);
  });

  test('the ten functions are rewritten from their own definition, not retyped', () => {
    // Retyping a body that moves money is how a migration changes behaviour
    // nobody re-reads. The rewrite reads pg_get_functiondef and replaces one
    // predicate, so every other line of an audited function is preserved byte
    // for byte.
    const rewritten = [
      ...PHASE3.matchAll(/pg_temp\.apply_rewrite\('([a-z_]+)'/g),
    ].map((m) => m[1] as string);
    expect(rewritten).toEqual([
      'set_order_status',
      'cancel_order',
      'validate_pickup_code',
      'reserve_offer',
      'accrue_order_earnings',
      'generate_payouts',
      'enforce_offer_business_availability',
      'active_offers_near',
      'get_platform_stats',
      'get_platform_public_stats',
    ]);
    expect(PHASE3).toMatch(/pg_get_functiondef\(p\.oid\)/i);
  });

  test('a rewrite fails loudly instead of silently no-oping', () => {
    // If someone edited one of those functions after this migration was
    // written, a silent no-op would leave it reading a column that is gone.
    expect(PHASE3).toMatch(
      /patron no encontrado en public\.%:\s*\[%\]/i,
    );
    expect(PHASE3).toMatch(/esperaba exactamente 1 overload de public\.%/i);
  });

  test('all twenty ownership policies resolve through business_ownership', () => {
    // Seventeen of them are on tables other than businesses: offers (4),
    // business_notification_preferences (3), offer_categories (2),
    // business_hours, business_locations, coupons, payouts, orders,
    // order_events, payment_intents and profiles. Counting them is the point.
    const policies = [
      ...PHASE3.matchAll(/create policy\s+"([^"]+)"\s+on\s+public\.(\w+)/gi),
    ];
    expect(policies.length, 'expected twenty recreated policies').toBe(20);

    const viaOwnership = PHASE3.match(
      /create policy[\s\S]*?business_ownership/g,
    );
    expect(viaOwnership).toBeDefined();

    const tables = new Set(policies.map((m) => (m[2] as string).toLowerCase()));
    for (const table of [
      'offers',
      'business_notification_preferences',
      'offer_categories',
      'business_hours',
      'business_locations',
      'coupons',
      'payouts',
      'orders',
      'order_events',
      'payment_intents',
      'profiles',
    ]) {
      expect(tables, `${table} lost its ownership policy`).toContain(table);
    }
  });

  test('no recreated policy still reaches for a moved column on businesses', () => {
    // Scoped to the policies on purpose. The rewrite helper legitimately
    // carries `b.owner_id = auth.uid()` as the search string it replaces, and
    // `orders.commission_rate` is a real snapshot column that must survive.
    const policySection = sql().split(/alter table public\.businesses/i)[0];
    // The insert policy is the one deliberate exception: it cannot check
    // ownership because the AFTER trigger has not written the row yet, and it
    // does not need to, because the database assigns the owner.
    const unowned = 'Authenticated can create businesses';
    for (const [, name] of [
      ...policySection.matchAll(/create policy\s+"([^"]+)"/gi),
    ]) {
      const body = policySection.match(
        new RegExp(`create policy\\s+"${name}"[\\s\\S]*?;`, 'i'),
      )?.[0];
      expect(body, `policy ${name} not found`).toBeDefined();
      expect(body).not.toMatch(/businesses\.owner_id/i);
      if (name === unowned) {
        expect(body).not.toMatch(/business_ownership/i);
      } else {
        expect(
          body,
          `${name} must resolve ownership via the companion`,
        ).toMatch(/business_ownership/i);
      }
    }
  });

  test('the ownership bootstrap is AFTER INSERT, because the companions have FKs', () => {
    // A BEFORE trigger runs before the parent row exists, so
    // `insert into business_finance (business_id) values (new.id)` fails 23503.
    // This was found by running the flow, not by reading the trigger.
    const trigger = sql().match(
      /create trigger trg_bootstrap_business_companions[\s\S]*?execute function public\.bootstrap_business_companions\(\);/i,
    )?.[0];
    expect(trigger).toBeDefined();
    expect(trigger).toMatch(/after insert on public\.businesses/i);
    expect(trigger).not.toMatch(/before insert/i);
  });

  test('the insert policy no longer demands an ownership row the trigger has not written yet', () => {
    // A BEFORE trigger could satisfy this. An AFTER trigger cannot, so the
    // policy gives up the check. That is not a weakening: the database assigns
    // owner_id from auth.uid(), so ownership stops being something the caller
    // expresses. The mobile client used to send owner_id in the insert body.
    expect(sql()).toMatch(
      /create policy\s+"Authenticated can create businesses"[\s\S]*?for insert[\s\S]*?with check \(true\)/i,
    );
    // The update policy keeps the check, because by then the ownership row exists.
    expect(sql()).toMatch(
      /create policy\s+"Owners can update own businesses"[\s\S]*?with check \(\s*exists/i,
    );

    const mobileRepository = readFileSync(
      join(
        import.meta.dir,
        '..',
        '..',
        '..',
        '..',
        '..',
        'apps',
        'mobile',
        'src',
        'features',
        'business',
        'data',
        'repository.ts',
      ),
      'utf8',
    );
    expect(mobileRepository).not.toMatch(/owner_id:\s*input\.ownerId/);
  });

  test('the drizzle schema declares no moved column on businesses', () => {
    const schema = readFileSync(DRIZZLE_BUSINESSES, 'utf8');
    for (const column of MOVED_COLUMNS) {
      expect(schema, `businesses.ts still declares ${column}`).not.toMatch(
        new RegExp(`^\\s*${column}\\s*:`, 'im'),
      );
    }
  });
});
