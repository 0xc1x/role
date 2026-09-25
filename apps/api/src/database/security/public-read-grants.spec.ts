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

  test('businesses: table-level SELECT is restored, and the exposure it buys is named', () => {
    // This is the debt, pinned on purpose.
    //
    // 20260925163235 replaced table-wide SELECT with per-column grants so anon
    // could not read the platform columns. That is incompatible with PostgREST:
    // offers, business_locations and orders hold foreign keys to businesses, and
    // PostgREST needs table-level SELECT on a referenced table to resolve
    // relationships, so every /rest/v1/offers read failed with 42501 - including
    // select=id with no embed. The offers catalog is the product.
    //
    // The two are mutually exclusive: either the table is exposed, or the
    // sensitive columns move off it. The follow-up is to move them to
    // business_finance and business_moderation. Until then these columns ARE
    // readable by anon, and this test exists so that fact is asserted rather
    // than forgotten. When the columns move, replace this test with one that
    // proves they are absent from the table again.
    const restore = [
      ...ALL_MIGRATIONS.matchAll(
        /grant select on table public\.businesses to anon, authenticated;/gi,
      ),
    ];
    expect(
      restore.length,
      'no migration restores table-level SELECT on businesses',
    ).toBeGreaterThan(0);

    expect(ALL_MIGRATIONS).toMatch(
      /EXPOSED TO ANON[\s\S]*commission_rate[\s\S]*balance[\s\S]*verification_status/i,
    );

    // Row access is still bounded: anon only reaches active businesses, which
    // is what RLS still guarantees while the columns are exposed.
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
