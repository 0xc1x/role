/**
 * The Supabase platform surface `supabase/migrations/` assumes, rebuilt on a
 * plain PostGIS container.
 *
 * WHY THIS EXISTS
 *
 * `apps/api/test/db.ts` builds its schema from `apps/api/drizzle/`, a Drizzle
 * mirror that carries no policies, no grants and no `auth.uid()`. It filters
 * them out on purpose (see its own comment: "Postgres pelado: sin auth ni roles
 * de Supabase"), so the 25 database specs run against a schema with no security
 * layer at all. The `auth.guard` and the module guards are unit-tested, and
 * `public-read-grants.spec.ts` asserts the migration TEXT, but no RLS policy
 * has ever been executed. A policy with a typo in a column name passes both.
 *
 * This module is the other half: it supplies the roles and the schemas the
 * migrations reference, so the migrations THEMSELVES can be replayed and their
 * policies can actually run.
 *
 * The migrations are the source of truth. This file is deliberately NOT a
 * reimplementation of them — it is the platform they were written against.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS REAL AND WHAT IS NOT
 *
 * Real (must match production, or a test asserts the wrong thing):
 *   - `auth.uid()` reads `request.jwt.claim.sub`, exactly as Supabase defines
 *     it, including the `request.jwt.claims` fallback. A harness that invented
 *     a different mechanism would pass while production failed.
 *   - the `anon` / `authenticated` / `service_role` role names, because GRANTs
 *     and `TO authenticated` in the policies are written against them.
 *   - `auth.users` as a real table, because 20+ foreign keys point at it and
 *     a stub that accepts the FK but has no rows would hide every seed failure.
 *
 * Stub (right surface, no behaviour):
 *   - `storage`, `cron`, `net`, `vault`. The signatures match what the
 *     migrations call; the side effects do not happen. `net.http_post`
 *     returns a fake request id, `cron.schedule` records a row, `vault`
 *     stores plaintext. Nothing that depends on a REAL dispatch can be
 *     asserted from here — see the dispatch tests' own scope.
 *   - `storage.buckets` carries the columns the policies touch. It is not
 *     Supabase Storage and does not emulate its quotas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW A TEST IMPERSONATES
 *
 * `auth.uid()` is a `current_setting` read, so a test becomes a user by
 * setting the claim and the role inside one transaction:
 *
 *     begin;
 *     set local role authenticated;
 *     select set_config('request.jwt.claim.sub', '<uuid>', true);
 *     select * from public.orders;   -- now filtered by that user's policies
 *     rollback;
 *
 * `set local` is scoped to the transaction, which is what keeps one persona
 * from leaking into the next assertion. The roles are declared `nologin`, so
 * there is no password to bypass: privilege comes from `set role` alone, and a
 * session that forgets to set it runs as the owner and bypasses RLS entirely —
 * the same trap `apps/api` has, which is why the spec asserting that is the
 * first one that must exist. `as()` is that mechanism, wrapped.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS IN HERE
 *
 *   SUPABASE_PLATFORM_BOOTSTRAP       the platform: roles, auth, stubs, and the
 *                                    default privileges Supabase provisions
 *   splitStatements()                 a dollar-quoting-aware statement splitter
 *   skipReason()                      the statements this harness must not run
 *   replayMigrations()                the ledger, one transaction per file
 *   ledgerFingerprint()               the cache key that makes the template safe
 *   createSupabaseTestDb()            a throwaway database cloned from a cached
 *                                    template, rebuilt when the ledger moves
 *   as() / deniedAs()                 the impersonation, and its negative form
 *
 * `apps/api/test/db.ts` is the other harness and the two are not alternatives.
 * That one builds from `apps/api/drizzle/`, which is fast, typed, and carries
 * no policies, no grants and no `auth.uid()` — by explicit design. This one
 * replays `supabase/migrations/`, which is slower and cannot be introspected by
 * Drizzle, and is the only one that can answer a question about a POLICY. Both
 * are needed: the mirror is where the API's own queries are tested, the ledger
 * is where the database's own rules are.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres, { type Sql } from 'postgres';

/**
 * The bootstrap, in dependency order. Every entry is a separate statement.
 *
 * Do NOT concatenate these and hand the result to a single `unsafe()` call:
 * postgres.js splits a multi-statement string on `;` without tracking dollar
 * quoting, which shreds every function body here. An array keeps the driver
 * out of the parsing business.
 */
export const SUPABASE_PLATFORM_BOOTSTRAP: readonly string[] = [
  // ── Real extensions ──────────────────────────────────────────────────────
  // PostGIS goes in `extensions` on purpose: the runtime reaches it as
  // `extensions.st_*`, and the session `search_path` deliberately does not
  // include it, so unqualified `st_*` still fails to resolve the way
  // production does.
  `create schema if not exists extensions`,
  `create extension if not exists postgis schema extensions`,
  `create extension if not exists pgcrypto schema extensions`,

  // ── Roles ────────────────────────────────────────────────────────────────
  // `nologin noinherit`: nobody connects AS these, they are only assumed via
  // `set role`. `service_role` gets `bypassrls` because that is what it is in
  // Supabase, and a test that asserts the service path must exercise the real
  // privilege rather than a weakened imitation.
  `do $b$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin noinherit;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin noinherit bypassrls;
    end if;
  end
$b$`,

  // ── auth ──────────────────────────────────────────────────────────────────
  // `auth.users` is a stub of a GoTrue-managed table. It must still be a real
  // relation: 20+ foreign keys resolve against it, and `businesses.owner_id`
  // among them, so the seed migrations fail here exactly as they would in
  // production.
  `create schema if not exists auth`,
  `create table if not exists auth.users (
     id uuid primary key default gen_random_uuid(),
     email text,
     raw_user_meta_data jsonb default '{}'::jsonb
   )`,

  // Byte-for-byte Supabase's definition, including the `request.jwt.claims`
  // fallback. PostgREST sets the single claim; some client paths send the
  // whole claims object, and a harness that only read one form would pass
  // while real traffic failed.
  `create or replace function auth.uid() returns uuid language sql stable as $b$
     select coalesce(
       nullif(current_setting('request.jwt.claim.sub', true), ''),
       (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
     )::uuid
   $b$`,
  // The cast on the first argument is load bearing: `current_setting` returns
  // text, and `coalesce(text, jsonb)` has no common type. Without it the
  // function does not exist, and everything built on `auth.uid()` cascades.
  `create or replace function auth.jwt() returns jsonb language sql stable as $b$
     select coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb,
       '{}'::jsonb
     )
   $b$`,
  `create or replace function auth.role() returns text language sql stable as $b$
     select coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       nullif(current_setting('role', true), '')
     )
   $b$`,
  `create or replace function auth.email() returns text language sql stable as $b$
     select nullif(auth.jwt() ->> 'email', '')
   $b$`,

  // ── storage ───────────────────────────────────────────────────────────────
  // `file_size_limit` and `allowed_mime_types` are here because
  // 20260925155445 policy-rewrites reference them by name; without the columns
  // that migration aborts and the policies it rewrites are never created.
  `create schema if not exists storage`,
  `create table if not exists storage.buckets (
     id text primary key,
     name text,
     owner uuid,
     public boolean default false,
     file_size_limit bigint,
     allowed_mime_types text[],
     created_at timestamptz default now(),
     updated_at timestamptz
   )`,
  `create table if not exists storage.objects (
     id uuid primary key default gen_random_uuid(),
     bucket_id text references storage.buckets(id),
     name text,
     owner uuid,
     created_at timestamptz default now(),
     updated_at timestamptz
   )`,
  `create or replace function storage.foldername(name text) returns text[]
     language sql immutable as $b$ select string_to_array(name, '/') $b$`,

  // ── vault ─────────────────────────────────────────────────────────────────
  // `decrypted_secrets` is a VIEW in Supabase, not a function — defining it as
  // one makes `from vault.decrypted_secrets` fail with 42P01 and takes three
  // migrations down with it. The column is `decrypted_secret`, NOT `secret`:
  // the underlying table stores ciphertext under `secret` and the view is what
  // exposes the plaintext. Getting the name wrong fails the same three files
  // with a far less obvious error.
  `create schema if not exists vault`,
  `create table if not exists vault.secrets (
     id uuid primary key default gen_random_uuid(),
     name text unique not null,
     description text default '',
     secret text not null,
     updated_at timestamptz default now()
   )`,
  `create or replace view vault.decrypted_secrets as
     select id, name, description, secret as decrypted_secret, updated_at
     from vault.secrets`,
  // Supabase's argument order is (new_secret, new_name, new_description,
  // new_key_id). The migrations call it positionally, so the order is load
  // bearing and must not be "tidied" to read better.
  `create or replace function vault.create_secret(
     new_secret text, new_name text, new_description text default '',
     new_key_id uuid default null
   ) returns uuid language plpgsql volatile as $b$
     declare v_id uuid;
     begin
       insert into vault.secrets (name, secret, description)
       values (new_name, new_secret, coalesce(new_description, ''))
       on conflict (name) do update set secret = excluded.secret
       returning id into v_id;
       return v_id;
     end
   $b$`,
  `create or replace function vault.update_secret(
     secret_id uuid, new_secret text, new_name text default null,
     new_description text default null, new_key_id uuid default null
   ) returns void language plpgsql volatile as $b$
     begin
       update vault.secrets set
         secret = coalesce(new_secret, secret),
         name = coalesce(new_name, name),
         description = coalesce(new_description, description),
         updated_at = now()
       where id = secret_id;
     end
   $b$`,

  // ── cron ──────────────────────────────────────────────────────────────────
  // Supplied here rather than by `create extension pg_cron`: the extension is
  // not in the postgis image and needs `shared_preload_libraries`, so it
  // cannot be installed by a test harness. The two migrations that create it
  // are filtered by `isPlatformProvidedExtension`.
  `create schema if not exists cron`,
  `create table if not exists cron.job (
     id bigserial primary key,
     jobname text,
     schedule text,
     command text,
     active boolean default true
   )`,
  `create or replace function cron.schedule(job_name text, schedule text, command text)
     returns bigint language plpgsql volatile as $b$
     declare v_id bigint;
     begin
       insert into cron.job (jobname, schedule, command)
       values (job_name, schedule, command)
       returning id into v_id;
       return v_id;
     end
   $b$`,
  `create or replace function cron.unschedule(job_name text) returns void
     language plpgsql volatile as $b$
     begin
       delete from cron.job where jobname = job_name;
     end
   $b$`,

  // ── net ───────────────────────────────────────────────────────────────────
  // pg_net is not available either. The signature must match: the dispatch
  // migration's entire bug history (headers smuggled through `params`) is a
  // wrong-signature bug, so a stub with a lazier signature would accept the
  // call that should have failed. It records nothing — a test that needs to
  // assert WHAT would have been dispatched cannot be served by this.
  `create schema if not exists net`,
  `create or replace function net.http_post(
     url text, body jsonb default null, params jsonb default null,
     headers jsonb default null, timeout_milliseconds integer default 1000
   ) returns bigint language sql volatile as $b$ select 1::bigint $b$`,

  // ── The default privileges a Supabase project starts with ────────────────
  // THE SINGLE MOST LOAD-BEARING BLOCK IN THIS FILE, and it was missing.
  //
  // Supabase provisions `anon`, `authenticated` and `service_role` with
  // `alter default privileges in schema public grant all ...`, so a table
  // created by any migration is BORN writable by `anon`: SELECT, INSERT,
  // UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER. Verified against
  // production: `public.categories` carries exactly those seven privileges for
  // all three client roles.
  //
  // Without this block the harness can execute ZERO policies. Every client role
  // is refused at the GRANT layer with `42501 permission denied for table ...`
  // before any policy is consulted, so a test written against it would assert a
  // grant error and call it an RLS result — the exact confusion this harness
  // exists to end. Measured before the block was added:
  //
  //   set role anon; select count(*) from public.categories
  //     -> 42501 permission denied for table categories
  //
  // And that was the READ path. `auth.uid()` was refused too, with
  // `42501 permission denied for schema auth`, so a table that did hold grants
  // still could not evaluate a predicate built on it.
  //
  // It goes in the BOOTSTRAP, before the replay, and as `alter default
  // privileges` rather than a bulk `grant all on all tables`. The distinction is
  // not cosmetic: the ledger's own hardening passes depend on it.
  // `20260925155153_harden_client_write_boundaries.sql` revokes `all privileges
  // on table public.profiles from anon, authenticated` and then grants SELECT
  // back. A bulk grant issued afterwards undoes that revoke and leaves
  // `authenticated` holding a full UPDATE on `profiles.role` — a privilege the
  // ledger deliberately removed. Default privileges apply at CREATE time, so
  // the ledger's revokes keep winning, which is the behaviour production has.
  //
  // ON FUNCTIONS IN `public` THIS DELIBERATELY GRANTS NOTHING.
  // `20260507215323_harden_phase2_security_surface.sql` runs `alter default
  // privileges in schema public revoke execute on functions from public, anon,
  // authenticated`. Supabase's blanket default contradicts that, and a harness
  // that re-granted it would make every function reachable from `anon` and hide
  // a real 42501. The ledger's decision stands.
  //
  // On the `auth` schema: production grants USAGE plus EXECUTE on `auth.uid()`
  // and friends to all three roles, so those are a reproduction of the platform
  // and not a widening of it.
  `grant usage on schema public to anon, authenticated, service_role`,
  `alter default privileges in schema public grant all on tables to anon, authenticated, service_role`,
  `alter default privileges in schema public grant all on sequences to anon, authenticated, service_role`,
  `grant usage on schema auth to anon, authenticated, service_role`,
  `grant execute on all functions in schema auth to anon, authenticated, service_role`,
  `alter default privileges in schema auth grant execute on functions to anon, authenticated, service_role`,

  // ── An auth.users column the ledger's trigger reads ───────────────────────
  // `phone`, and its absence was a second silent hole.
  // `20260509214339_fix_profiles_rls_infinite_recursion.sql` installs
  // `on_auth_user_created -> handle_new_user()`, and `20260925155153` reissues
  // the same body; both read `new.phone`. GoTrue's `auth.users` has that column,
  // so in production a signup works. Here the stub did not, and the failure is
  // NOT a missing-column error — plpgsql resolves `NEW` as a record at run
  // time:
  //
  //   insert into auth.users (id, email) values (...)  ->  42703 record "new" has no field "phone"
  //
  // which means no test could seed a user through the real signup path, and an
  // admin could not be created at all: `auth_helpers.my_role()` reads
  // `public.profiles`, whose only producer is that trigger. Half the admin
  // policy surface was untestable for a reason that had nothing to do with
  // policies.
  `alter table auth.users add column if not exists phone text`,
];

/**
 * Platform grants that CANNOT live in the bootstrap, because the schema they
 * name does not exist yet. Deliberately EMPTY. Read this before adding to it.
 *
 * This array used to hold exactly one statement:
 *
 *     grant usage on schema auth_helpers to anon, authenticated, service_role
 *
 * It was there so that `categories.rls.db.spec.ts` could prove "an admin can
 * insert, update and delete through the admin policy" — the admin policies are
 * written `USING (auth_helpers.my_role() = 'admin')`, and calling that helper
 * needs USAGE on the schema that holds it. It was a harness-side assumption
 * about a privilege the ledger never granted, made so a test could pass.
 *
 * IT WAS WRONG. The privilege is absent in PRODUCTION, measured against it
 * directly rather than inferred from the ledger:
 *
 *     has_schema_privilege('anon',         'auth_helpers', 'usage') -> false
 *     has_schema_privilege('authenticated', 'auth_helpers', 'usage') -> false
 *     has_schema_privilege('service_role',  'auth_helpers', 'usage') -> false
 *     has_function_privilege('authenticated','auth_helpers.my_role()','execute')
 *       -> true
 *
 * `20260509214339_fix_profiles_rls_infinite_recursion.sql` creates the schema
 * and grants EXECUTE on `my_role()` to `authenticated` and `anon`, and stops
 * there. EXECUTE without USAGE is unreachable by name, so the ledger is not
 * half-writing an intent: the hole is real and it is in the database.
 *
 * ─── What that means, in production, today ─────────────────────────────────
 *
 * 32 policies across 28 tables carry `auth_helpers` in their `USING` or
 * `WITH CHECK`, and every one of them is UNREACHABLE from a client session
 * acting as `authenticated`. The admin write path through PostgREST does not
 * exist. It has no visible effect because the public read policies are
 * PERMISSIVE and get ORed, so Postgres short-circuits on the first true one
 * and never evaluates the admin policy — consumer reads are unaffected, and
 * the hole is invisible exactly where you would look for it. The admin panel
 * works today because it goes through the NestJS API, which connects as the
 * SCHEMA OWNER and bypasses both layers.
 *
 * ─── Why the harness must not paper over it ────────────────────────────────
 *
 * A fidelity harness that grants a privilege production lacks stops being a
 * measurement and becomes a piece of fiction: it would report that a write path
 * works, and that is the one claim with no other safety net. The harness now
 * reproduces the real state — the grant is gone, and
 * `public.categories: the admin policy is unreachable` in
 * `categories.rls.db.spec.ts` pins the missing privilege so that re-adding it
 * fails a test instead of silently restoring the lie.
 *
 * ─── If you are about to add a grant here ──────────────────────────────────
 *
 * Do not. First answer, against PRODUCTION and not against this directory:
 * does the privilege exist there? If it does not, adding it here makes every
 * assertion below describe a database nobody runs. If you have verified it does
 * exist, the finding is that the LEDGER is missing a statement, and the fix
 * belongs in `supabase/migrations/` through `apply_migration` — after which it
 * replays here by itself and this array stays empty.
 *
 * Note the asymmetry with the block in the bootstrap above: there, the Supabase
 * default privileges are reproduced because production demonstrably has them.
 * Here, the privilege is demonstrably ABSENT. Reproduce what the database is,
 * not what the policies would need in order to work.
 */
export const PLATFORM_GRANTS_AFTER_REPLAY: readonly string[] = [];

/**
 * Extensions the harness supplies as schemas, so `create extension` for them
 * must be dropped rather than executed.
 *
 * `postgis` and `pgcrypto` are deliberately absent from this list: the
 * bootstrap creates them for real, and their `if not exists` statements are
 * harmless no-ops on a replay.
 */
const PLATFORM_PROVIDED_EXTENSIONS = ['pg_cron', 'pg_net'] as const;

/**
 * Split one migration file into the statements Postgres would treat as
 * separate.
 *
 * WHY THIS INSTEAD OF `split('--> statement-breakpoint')`
 *
 * Because `create extension if not exists pg_cron` in
 * `20260615211014_setup_push_cron.sql` shares its chunk with the
 * `cron.schedule` call and the `cleanup_old_device_tokens` definition — that
 * file carries no statement breakpoints. Skipping the chunk to dodge the
 * missing extension therefore also deletes the function, and the next
 * migration fails with "cleanup_old_device_tokens does not exist" for a reason
 * the harness itself caused. A cascade the harness invents is worse than no
 * harness: it sends the next person hunting a ledger hole that is not there.
 *
 * It also cannot be delegated to the driver. `postgres.js` splits a
 * multi-statement string on `;` without tracking dollar quoting, so every
 * function body is shredded before it reaches the server. The bootstrap array
 * exists partly to route around that; this closes the same gap for the replay.
 *
 * Handles `$$` and `$tag$` bodies, single-quoted strings with `''` escapes,
 * `--` line comments and nestable `/* *\/` block comments. The DDL in this
 * ledger keeps string literals containing semicolons and comment markers, so a
 * naive split corrupts real files, not hypothetical ones.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let i = 0;
  const n = sql.length;

  /** Non-null while inside a `$tag$` body, delimiters included. */
  let dollarTag: string | null = null;
  /** A single-quoted string or a quoted identifier. */
  let quote: '"' | "'" | null = null;
  let lineComment = false;
  let blockDepth = 0;

  const push = () => {
    const s = buf.trim();
    if (s) out.push(s);
    buf = '';
  };

  while (i < n) {
    const c = sql[i]!;
    const rest = sql.slice(i);

    if (lineComment) {
      if (c === '\n') lineComment = false;
      buf += c;
      i++;
      continue;
    }
    if (blockDepth > 0) {
      if (rest.startsWith('/*')) {
        blockDepth++;
        buf += '/*';
        i += 2;
        continue;
      }
      if (rest.startsWith('*/')) {
        blockDepth--;
        buf += '*/';
        i += 2;
        continue;
      }
      buf += c;
      i++;
      continue;
    }
    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += c;
      i++;
      continue;
    }
    if (quote) {
      buf += c;
      if (c === quote) {
        // A doubled quote is an escaped quote, not the end of the literal.
        if (sql[i + 1] === quote) {
          buf += sql[i + 1]!;
          i += 2;
          continue;
        }
        quote = null;
      }
      i++;
      continue;
    }

    // Outside everything: the only places a delimiter can begin.
    if (rest.startsWith('--')) {
      lineComment = true;
      buf += '--';
      i += 2;
      continue;
    }
    if (rest.startsWith('/*')) {
      blockDepth = 1;
      buf += '/*';
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      buf += c;
      i++;
      continue;
    }

    const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(rest);
    if (tag) {
      dollarTag = tag[0];
      buf += tag[0];
      i += tag[0].length;
      continue;
    }

    if (c === ';') {
      push();
      i++;
      continue;
    }

    buf += c;
    i++;
  }
  // A trailing statement with no semicolon still has to run.
  push();
  return out;
}

/**
 * True for a migration statement this harness must not execute, with the
 * reason. Kept separate from the splitter so the exclusions stay auditable:
 * each one is a deviation from production that a reader can contest.
 *
 * Leading comments are stripped before matching and the test is not anchored,
 * because a statement that opens with `-- Enable pg_cron for scheduling` still
 * has to be recognised as the extension statement it is.
 */
export function skipReason(statement: string): string | null {
  const sql = statement.replace(/--[^\n]*/g, ' ').trim();
  if (/^create\s+extension/i.test(sql)) {
    const ext =
      /create\s+extension(?:\s+if\s+not\s+exists)?\s+"?([a-z_][a-z0-9_]*)"?/i
        .exec(sql)?.[1]
        ?.toLowerCase();
    if (
      ext &&
      (PLATFORM_PROVIDED_EXTENSIONS as readonly string[]).includes(ext)
    ) {
      return `extension ${ext} is provided as a schema stub by the harness`;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE HARNESS: replaying the ledger, and turning the result into a test database
//
// Two things happen above this line — the platform is declared, and the SQL is
// parsed. Everything below actually connects to a database, which is a
// different kind of commitment: once a test has a real schema with real
// policies, a bug in here reads as a bug in production.
// ─────────────────────────────────────────────────────────────────────────────

/** The migrations this harness replays. Resolved from this file, not from cwd. */
const MIGRATIONS_DIR = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  'supabase',
  'migrations',
);

/** Base connection for the test Postgres: `docker compose up postgres-test` or CI. */
const BASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:6432/role_test';

/**
 * The cached, fully replayed database every test database is cloned from.
 *
 * It is a CLONE, not a shared connection: `create database ... template ...`
 * copies it, so a test that writes rows, drops a policy or breaks a constraint
 * cannot reach the next test file. Shared mutable state across spec files is
 * how a suite stops being reproducible.
 */
const TEMPLATE_DB = 'rls_template';

/** Where the fingerprint of the template lives inside the template. */
const FINGERPRINT_TABLE = 'public._harness_fingerprint';

/**
 * Advisory lock key for the template build. Arbitrary but fixed: it only has to
 * be the same number in every process on this machine.
 */
const TEMPLATE_LOCK_KEY = 'role:apps/api:supabase-platform:template';

/**
 * Bump when the harness's own behaviour changes, not just its data.
 *
 * The fingerprint below hashes the migration BYTES and the bootstrap
 * STATEMENTS, which is what "did the schema change" means. It does not hash this
 * file. So a change to `splitStatements()` or to the per-file transaction shape
 * would silently reuse a template built by the old logic — which is precisely
 * the class of bug a fingerprint is supposed to prevent, so the revision is
 * part of the input and has to be moved by hand.
 */
const HARNESS_REVISION = 1;

/** One migration that did not apply, in the shape a test can assert on. */
export interface ReplayFailure {
  /** The file, as it is named in `supabase/migrations/`. */
  file: string;
  /** SQLSTATE. Stable, greppable, and the only part of the message worth pinning. */
  code: string;
  /** First line of the server message, whitespace-collapsed. For humans only. */
  msg: string;
}

/**
 * One entry of the ledger's known replay debt: a migration this directory
 * cannot apply, and why.
 *
 * `msgIncludes` is not decoration. Comparing files alone would treat
 * `20260927025753` failing for any reason as the same known failure, and this
 * list has already been wrong once: it was written when the failures had no
 * SQLSTATE, so every entry read as `?`. Pinning the code and a fragment of the
 * message is what makes "the same failure" a claim that can be checked.
 */
export interface KnownReplayFailure {
  file: string;
  code: string;
  msgIncludes: string;
  /** What actually stops it. One paragraph, because the fix is not obvious. */
  why: string;
}

/**
 * The seven migrations `supabase/migrations/` cannot apply to a fresh database.
 *
 * ─── Why this is a hard list and not a tolerance ───────────────────────────
 *
 * `createSupabaseTestDb()` refuses to build a template when the failure set is
 * anything other than exactly this. A harness that tolerated "up to N
 * failures" would absorb a new break on the run after the one that mattered,
 * and the tests would go on asserting against a schema nobody reviewed. So the
 * debt is a fixture, not a budget: add a migration that fails and the harness
 * refuses to produce a database and prints the file. Fix one of these and the
 * harness refuses too, and prints the file that stopped failing.
 *
 * ─── What the resulting database therefore is ──────────────────────────────
 *
 * 109 of 116 migrations applied cleanly, 937 of 944 statements. The seven
 * aborted files contributed nothing: each ran in its own transaction and rolled
 * back whole. The end state carries 103 policies on 34 RLS-enabled tables out
 * of 39, and that is a real schema, not a partial one — but three of the
 * failures are rewrites of `public.reserve_offer` and
 * `public.notify_business_pending`, so those two functions are at their
 * pre-rewrite definitions. Anything that asserts on their bodies is asserting
 * on a version production replaced.
 *
 * Read every `why` before "fixing" one. Three of them are not ledger bugs and
 * must never be papered over by editing a migration.
 */
export const KNOWN_REPLAY_FAILURES: readonly KnownReplayFailure[] = [
  {
    file: '20260507200106_insert_seed_businesses_and_hours.sql',
    code: '23503',
    msgIncludes: 'businesses_owner_id_fkey',
    why:
      'BY DESIGN, and unfixable in this repository. The seed businesses carry ' +
      'owner ids that must exist in `auth.users`, and the migration that created ' +
      'them — `20260507195823_insert_seed_auth_users_and_profiles.sql` — is a ' +
      'deliberate `select 1;` in this directory, because the original embedded ' +
      'bcrypt password hashes and the repository is public. `supabase/migrations/README.md` ' +
      'documents the removal and how to restore it. A fresh replay has no seed ' +
      'users, so `businesses.owner_id` has nothing to point at.',
  },
  {
    file: '20260507200508_insert_seed_offers_coupons_orders.sql',
    code: '23503',
    msgIncludes: 'offers_business_id_fkey',
    why:
      'Cascade of the entry above. `offers.business_id` references the ' +
      '`businesses` rows that never landed, so the seed cannot proceed. Fixing ' +
      'the FK or the order would be treating a symptom and would leave the ' +
      'first failure in place.',
  },
  {
    file: '20260906125927_harden_rpc_grants.sql',
    code: '42883',
    msgIncludes: 'cancel_order(uuid, uuid, uuid)',
    why:
      'A version-ordering problem, not a content problem. The file revokes and ' +
      'grants `execute` on `public.cancel_order(uuid, uuid, uuid)`, and the only ' +
      'migration in this directory that creates that three-argument signature is ' +
      '`20260906130017_bind_order_rpc_identity.sql` — whose version is LATER. In a ' +
      'filename-ordered replay the function does not exist yet. Before this file, ' +
      'the newest definition is the arity-2 `20260829005426` one, and `CREATE OR ' +
      'REPLACE` keys on argument types, so arity 2 cannot be rewritten into arity ' +
      "3. So either the directory's versions for this pair do not reflect the " +
      'order the server applied them in, or this migration could not have applied ' +
      'where it is. `20260906131000_drop_legacy_cancel_order_overload.sql` ' +
      'documents the surviving overload in detail.',
  },
  {
    file: '20260927025753_businesses_drop_sensitive_columns.sql',
    code: 'P0001',
    msgIncludes: 'patron no encontrado en public.reserve_offer',
    why:
      'The root of the other three rewrite failures, so fix this one first. The ' +
      'migration rewrites ten functions in place by locating literal text in ' +
      '`pg_get_functiondef` and asserting each substitution matched. It searches ' +
      'for `select commission_rate into v_commission_rate from public.businesses ' +
      'where id=v_offer.business_id;` — and `20260925155433_harden_business_order_reservations.sql` ' +
      'already recreated `public.reserve_offer` with a four-argument signature ' +
      '`(uuid, uuid, uuid, text)` and a different body, so the literal is gone. ' +
      'The rewrite raises instead of no-oping, which is the right call and the ' +
      'reason the failure is legible. Note the whole file rolls back, so this ' +
      'also leaves `public.notify_business_pending()` at its pre-rewrite ' +
      'definition — which is what breaks `20260927053728`.',
  },
  {
    file: '20260927033509_reserve_offer_coupon_rejection.sql',
    code: 'P0001',
    msgIncludes: 'reserve_offer coupon block does not match the expected text',
    why:
      'Cascade of `20260927025753`. This migration rewrites the coupon block of ' +
      '`public.reserve_offer`, and the text it searches for exists only in the ' +
      'body the previous migration was supposed to have produced. Same ' +
      'in-place-rewrite design, same `pg_get_functiondef` text matching, same ' +
      'fail-loud behaviour.',
  },
  {
    file: '20260927053728_normalize_role_domain.sql',
    code: 'P0001',
    msgIncludes: 'notify_business_pending does not match the expected text',
    why:
      'Cascade of `20260927025753`, through the trigger and not through the ' +
      "function it names. That migration's rewrite of " +
      '`public.notify_business_pending()` is what introduced the ' +
      '`adminUrl` literal this one searches for; rolled back, the function still ' +
      'has its `20260902001059` body and the literal does not exist. Also a ' +
      'cascade for the data half: this is the only migration in the directory ' +
      'that moves `privacy.contact_email` off `role.app`.',
  },
  {
    file: '20260927141336_confirm_admin_domain.sql',
    code: 'P0001',
    msgIncludes: 'non-social app_config still references role.app',
    why:
      'Two causes, and only one of them is a cascade. `privacy.contact_email` is ' +
      'here because `20260927053728` failed. The other four — `support.email`, ' +
      '`contact.hola_email`, `contact.negocios_email`, `legal.contact_email` — ' +
      'are moved by NO migration in this directory: ' +
      '`20260926021657_business_templates_support_domain.sql` announces in its own ' +
      'header that it moved eight `app_config` values and then updates only ' +
      '`email_templates.body_html`, never `app_config`. Its header documents an ' +
      'intent its SQL does not implement. `20260821205638_create_app_config.sql` ' +
      'seeds the keys with the `role.app` values, so a fresh replay can never ' +
      'satisfy this assertion.',
  },
];

/**
 * Compare an actual failure set against the pinned one and describe the drift.
 *
 * Returns a list of human-readable differences and an empty list when the sets
 * match exactly. A file appearing is reported as `NEW`, a file disappearing as
 * `FIXED` — because both are news. "Fixed" is not automatically good news: it
 * means the fixture is stale and the reason it gave is no longer the reason it
 * fails, or no longer fails at all.
 */
export function diffReplayFailures(actual: readonly ReplayFailure[]): string[] {
  const byFile = new Map<string, ReplayFailure[]>();
  for (const failure of actual) {
    const list = byFile.get(failure.file) ?? [];
    list.push(failure);
    byFile.set(failure.file, list);
  }

  const problems: string[] = [];
  const knownFiles = new Set(KNOWN_REPLAY_FAILURES.map((k) => k.file));

  for (const known of KNOWN_REPLAY_FAILURES) {
    const got = byFile.get(known.file);
    if (!got || got.length === 0) {
      problems.push(
        `FIXED  ${known.file} no longer fails. If you fixed it, delete the entry ` +
          `and keep its reason in the commit message; if it now fails differently, ` +
          `that is the same bug in a new place.`,
      );
      continue;
    }
    const failure = got[0] as ReplayFailure;
    if (failure.code !== known.code) {
      problems.push(
        `CHANGED ${known.file} now fails with ${failure.code}, the fixture pins ` +
          `${known.code}. Message: ${failure.msg}`,
      );
    }
    if (!failure.msg.includes(known.msgIncludes)) {
      problems.push(
        `CHANGED ${known.file} message no longer contains "${known.msgIncludes}". ` +
          `Message: ${failure.msg}`,
      );
    }
  }

  for (const file of byFile.keys()) {
    if (!knownFiles.has(file)) {
      const failure = byFile.get(file)?.[0] as ReplayFailure;
      problems.push(
        `NEW     ${file} fails with ${failure?.code} and is not in ` +
          `KNOWN_REPLAY_FAILURES. ${failure?.msg ?? ''}`,
      );
    }
  }

  return problems;
}

/** One statement the harness refused to run, and why. */
export interface ReplaySkip {
  file: string;
  reason: string;
}

export interface ReplayResult {
  /** Statements that executed without error. */
  applied: number;
  /** Files that aborted, in filename order. One entry per file, not per statement. */
  failures: ReplayFailure[];
  /** Statements dropped by `skipReason()`. */
  skipped: ReplaySkip[];
}

/**
 * Normalise a postgres.js error into something a test can compare.
 *
 * The SQLSTATE comes from `err.code`, not from a regex over the message. The
 * spike parsed the message and reported `?` for all seven of its failures,
 * which threw away the one field that is stable across Postgres versions, word
 * wrapping and locale.
 */
function describeError(error: unknown): { code: string; msg: string } {
  const err = error as { code?: unknown; message?: unknown };
  const code = typeof err?.code === 'string' ? err.code : '????';
  const raw = typeof err?.message === 'string' ? err.message : String(error);
  const msg = raw.replace(/\s+/g, ' ').trim();
  return { code, msg: msg.length > 180 ? `${msg.slice(0, 180)}...` : msg };
}

/** Every migration file, in the order `supabase db push` would apply them. */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/**
 * Replay `supabase/migrations/` into `sql`, ONE TRANSACTION PER FILE.
 *
 * ─── Why the transaction is per file and not per statement ────────────────
 *
 * Because that is what `apply_migration` does, and the difference is not
 * cosmetic. Sending each statement on its own implicit transaction and issuing
 * a bare `rollback` on failure corrupts the result in a way that looks like a
 * fidelity bug: a file carrying its own `begin;` (most of this ledger's later
 * migrations do) shares one transaction, so the rollback discards everything
 * back to that `begin` — including statements that had already succeeded and
 * that production kept. `20260925163235` is the concrete case: it rotated the
 * Vault secret and dropped two `order_events` policies before failing on a
 * later `grant`, and the earlier shape undid all three. Production has zero
 * INSERT policies on `order_events`; the harness was reporting two it should
 * not have.
 *
 * Atomicity per file is also what makes the failure count mean something: a
 * file either applied or it did not, so `failures.length` is a count of broken
 * migrations rather than of broken statements.
 *
 * ─── Why the first error aborts the file ──────────────────────────────────
 *
 * Production stops at the first error, and continuing past it produces a
 * cascade of derived failures that sends the next reader hunting a hole in the
 * ledger that is not there. `createSupabaseTestDb` refuses to build a template
 * at all when this returns any failure, so the failures a test sees are always
 * the seven real ones and never a cascade.
 */
export async function replayMigrations(sql: Sql): Promise<ReplayResult> {
  const failures: ReplayFailure[] = [];
  const skipped: ReplaySkip[] = [];
  let applied = 0;

  for (const file of migrationFiles()) {
    const statements = splitStatements(
      readFileSync(join(MIGRATIONS_DIR, file), 'utf8'),
    );

    // Set by the transaction callback before it re-throws. `begin()` rejects
    // with whatever the callback threw, and re-wrapping it here would lose the
    // server's own message, so the details are carried out of the closure and
    // the throw is only a signal to roll the file back.
    let failure: ReplayFailure | null = null;

    await sql
      .begin(async (tx) => {
        for (const statement of statements) {
          const skip = skipReason(statement);
          if (skip) {
            skipped.push({ file, reason: skip });
            continue;
          }
          try {
            await tx.unsafe(statement);
            applied++;
          } catch (error) {
            failure = { file, ...describeError(error) };
            // Throwing is what rolls the file back. Returning would commit
            // whatever ran before the error, which is the corruption described
            // above.
            throw error;
          }
        }
      })
      .catch(() => {
        // Already recorded above. A failure with no `failure` set would mean the
        // transaction itself broke — a dropped connection, most likely — and
        // that must not be reported as a clean migration.
        if (failure) failures.push(failure);
        else failures.push({ file, code: '????', msg: 'transaction failed' });
      });
  }

  return { applied, failures, skipped };
}

/**
 * A hash of everything that decides what the replayed database looks like.
 *
 * ─── Why this cannot be a timestamp or a file count ───────────────────────
 *
 * A template is a cache, and a cache with no validator is worse than no cache:
 * add a migration, and every test file keeps cloning the old schema. Nothing
 * fails. The suite is green against a database that no longer exists, which is
 * the most expensive way a fidelity harness can be wrong — the tests are
 * asserting that real policies behave a certain way, and they are asserting it
 * about last month's policies.
 *
 * So the input is the CONTENT of every migration file plus the bootstrap plus
 * the post-replay grants plus a manual revision number, hashed with SHA-256.
 * Edit any migration's whitespace and the template is rebuilt, which is correct
 * and cheap: the build costs a couple of seconds, not a coffee break.
 */
export function ledgerFingerprint(): string {
  const hash = createHash('sha256');
  hash.update(`harness:v${HARNESS_REVISION}\n`);
  for (const file of migrationFiles()) {
    hash.update(`${file}\0`);
    hash.update(readFileSync(join(MIGRATIONS_DIR, file)));
    hash.update('\0');
  }
  for (const statement of SUPABASE_PLATFORM_BOOTSTRAP) {
    hash.update(`${statement}\0`);
  }
  for (const statement of PLATFORM_GRANTS_AFTER_REPLAY) {
    hash.update(`${statement}\0`);
  }
  return hash.digest('hex');
}

/** An admin connection to the maintenance database. */
function adminConnection(max = 1): Sql {
  return postgres(BASE_URL, {
    prepare: false,
    max,
    database: 'postgres',
    onnotice: () => {},
  });
}

/**
 * Take the template lock, or wait for whoever holds it.
 *
 * Polling `pg_try_advisory_lock` rather than blocking in `pg_advisory_lock`,
 * because a blocking lock in a test process is indistinguishable from a hung
 * suite. The caller re-checks the fingerprint after acquiring, so a process
 * that waited and then found a fresh template built by the winner does no work.
 */
async function acquireTemplateLock(
  admin: Sql,
  timeoutMs = 120_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await admin.unsafe(
      `select pg_try_advisory_lock(hashtextextended('${TEMPLATE_LOCK_KEY}', 0)) as locked`,
    );
    if (rows[0]?.locked === true) return;
    if (Date.now() > deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for the ${TEMPLATE_DB} advisory lock. ` +
          `Another process is building it, or one died holding it; the lock is ` +
          `session-scoped, so a dead session released it already and the build ` +
          `is genuinely still running.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Whether `rls_template` exists and was built from the current ledger. */
async function templateIsFresh(
  admin: Sql,
  fingerprint: string,
): Promise<boolean> {
  const exists = await admin.unsafe(
    `select 1 from pg_database where datname = '${TEMPLATE_DB}'`,
  );
  if (exists.length === 0) return false;

  // Read the fingerprint from INSIDE the template. Asking `postgres` would
  // answer for the maintenance database and every fresh template would look
  // stale.
  const url = new URL(BASE_URL);
  url.pathname = `/${TEMPLATE_DB}`;
  const probe = postgres(url.toString(), {
    prepare: false,
    max: 1,
    onnotice: () => {},
  });
  try {
    const rows = await probe.unsafe(
      `select fingerprint from ${FINGERPRINT_TABLE} where id = 1`,
    );
    return rows[0]?.fingerprint === fingerprint;
  } catch {
    // No table, or no row: a template from a harness that did not write one.
    return false;
  } finally {
    await probe.end({ timeout: 5 });
  }
}

/**
 * Build `rls_template` from scratch. Only called with the advisory lock held.
 *
 * Throws on any replay failure. A template that is missing seven migrations is
 * not a degraded test database, it is a different one, and every assertion made
 * against it would be about a schema that production does not have.
 */
async function buildTemplate(
  admin: Sql,
  fingerprint: string,
): Promise<ReplayResult> {
  await admin.unsafe(`drop database if exists "${TEMPLATE_DB}" with (force)`);
  await admin.unsafe(`create database "${TEMPLATE_DB}"`);

  const url = new URL(BASE_URL);
  url.pathname = `/${TEMPLATE_DB}`;
  const db = postgres(url.toString(), {
    prepare: false,
    max: 1,
    onnotice: () => {},
  });

  try {
    // The bootstrap is executed one statement at a time and a failure is
    // reported WITH the statement. Every entry is already its own array element
    // for driver reasons; naming the offender in the error is what makes a
    // platform gap diagnosable at 2am instead of at the next read of the file.
    for (const [index, statement] of SUPABASE_PLATFORM_BOOTSTRAP.entries()) {
      try {
        await db.unsafe(statement);
      } catch (error) {
        const { code, msg } = describeError(error);
        throw new Error(
          `${TEMPLATE_DB} bootstrap statement ${index + 1} of ` +
            `${SUPABASE_PLATFORM_BOOTSTRAP.length} failed with ${code}: ${msg}\n` +
            `  ${statement.split('\n')[0]?.trim()}\n` +
            `A bootstrap statement failing means the platform this harness emulates ` +
            `does not match the one the ledger was written against. Fix the ` +
            `statement; do not work around it in a spec.`,
        );
      }
    }

    const replay = await replayMigrations(db);
    // The gate is on the SET, not on the count. Seven known failures build a
    // real database; seven DIFFERENT ones do not, and neither does six.
    const drift = diffReplayFailures(replay.failures);
    if (drift.length > 0) {
      const detail = replay.failures
        .map((f) => `  ${f.file}\n    ${f.code} ${f.msg}`)
        .join('\n');
      throw new Error(
        `the ${TEMPLATE_DB} build failed: ${replay.failures.length} of ` +
          `${migrationFiles().length} migrations did not apply, and the failing ` +
          `set is not the one this harness knows about. A template that is ` +
          `missing migrations is a different database, not a degraded one, and ` +
          `every assertion made against it would be about a schema production ` +
          `does not have.\n\n${detail}\n\nDrift against KNOWN_REPLAY_FAILURES:\n` +
          `${drift.map((d) => `  ${d}`).join('\n')}\n\n` +
          `Each entry in KNOWN_REPLAY_FAILURES carries a paragraph on why it ` +
          `fails. Read it before changing anything — three of the seven are not ` +
          `ledger bugs and must not be closed by editing a migration.`,
      );
    }

    for (const [index, statement] of PLATFORM_GRANTS_AFTER_REPLAY.entries()) {
      try {
        await db.unsafe(statement);
      } catch (error) {
        const { code, msg } = describeError(error);
        throw new Error(
          `${TEMPLATE_DB} post-replay grant ${index + 1} of ` +
            `${PLATFORM_GRANTS_AFTER_REPLAY.length} failed with ${code}: ${msg}\n` +
            `  ${statement}\n` +
            `These run after the ledger, because the schemas they name are created ` +
            `by it. A failure here usually means the ledger stopped creating that ` +
            `schema, or stopped granting on what is inside it.`,
        );
      }
    }

    // The fingerprint is written LAST, after the grants, so its presence is a
    // promise that the whole build finished. A template interrupted midway has
    // no row and is treated as stale.
    //
    // The replay summary rides along with it so a spec can pin the ledger's
    // known failures against a template that a PREVIOUS process built. The
    // build result is not always available in-process — a warm cache skips the
    // replay entirely — and a fixture that can only be read on a cold run is a
    // fixture that stops being checked exactly when someone is relying on it.
    //
    // The table is revoked from the client roles even though the default
    // privileges above granted them everything: it is harness bookkeeping, and
    // the one object in this database that has no business being reachable
    // from `anon`.
    //
    // Four separate calls, not one string: the `insert` carries parameters, and
    // a parameterised query goes through the EXTENDED protocol, which refuses
    // more than one statement with `42601 cannot insert multiple commands into
    // a prepared statement`. Unparameterised `unsafe` uses the simple protocol
    // and is happy with a batch, which is why the bootstrap above is one array
    // entry per statement anyway.
    await db.unsafe(
      `create table if not exists ${FINGERPRINT_TABLE} (
         id          integer primary key,
         fingerprint text not null,
         replay      jsonb  not null,
         built_at    timestamptz not null default now()
       )`,
    );
    await db.unsafe(
      `revoke all on ${FINGERPRINT_TABLE} from anon, authenticated, service_role`,
    );
    await db.unsafe(`truncate ${FINGERPRINT_TABLE}`);
    // The replay summary is passed as an OBJECT, not as `JSON.stringify` of one.
    // postgres.js serialises an object argument to a JSON text parameter, so
    // `$2::jsonb` parses it into a real jsonb document; handing it the already
    // stringified value instead stores a jsonb SCALAR containing that text, and
    // the column reads back as a quoted string. That failure is silent — the
    // summary parses to nothing and the ledger fixture would then assert that
    // the known debt does not exist, which is the one thing it must never do.
    //
    // The `JSON.parse(JSON.stringify(...))` round trip is for the TYPE, not the
    // wire format: postgres.js types a parameter as `ParameterOrJSON`, and
    // `ReplayResult` has no index signature, so it does not fit. The round trip
    // yields the plain JSON document the driver is going to serialise anyway.
    const summary = JSON.parse(JSON.stringify(replay)) as Record<string, never>;
    await db.unsafe(
      `insert into ${FINGERPRINT_TABLE} (id, fingerprint, replay)
       values (1, $1, $2::jsonb)`,
      [fingerprint, summary],
    );

    return replay;
  } catch (error) {
    // Leave no half-built template behind: the next process would find it,
    // read no fingerprint, and rebuild anyway — but a stale database named
    // `rls_template` is a trap for anyone inspecting it by hand.
    await db.end({ timeout: 5 }).catch(() => {});
    await admin
      .unsafe(`drop database if exists "${TEMPLATE_DB}" with (force)`)
      .catch(() => {});
    throw error;
  } finally {
    await db.end({ timeout: 5 }).catch(() => {});
  }
}

export interface SupabaseTestDb {
  /** Connected to this database. `max: 1` is deliberate — see `as()`. */
  sql: Sql;
  /** The generated database name, for a failing assertion that wants to say it. */
  dbName: string;
  connectionString: string;
  /** The replay that produced the template this database was cloned from. */
  replay: ReplayResult;
  /** Fingerprint the template was built from. */
  fingerprint: string;
  /** False when the template was reused. Timings are only comparable across a rebuild. */
  templateRebuilt: boolean;
  /** Wall-clock milliseconds spent inside the lock, build included. */
  templateWaitMs: number;
  /** Drop the database. Safe to call twice. */
  stop: () => Promise<void>;
}

/**
 * A throwaway database carrying the real schema, the real policies and the real
 * grants, cloned from a cached template.
 *
 * ─── Why the template exists ───────────────────────────────────────────────
 *
 * The replay is not slow enough to be a problem and fast enough to be
 * embarrassing: on a warm container it is a couple of seconds, and every spec
 * file would pay it. Cloning a database is a file copy, so a cached template
 * turns "a few seconds per file" into "a few milliseconds". The fingerprint is
 * what makes that safe — see `ledgerFingerprint()`.
 *
 * ─── What this is and is not ───────────────────────────────────────────────
 *
 * The tables, the 103 policies, the grants and the trigger bodies are the
 * ledger's own, replayed. They are not a mirror, and they are not typed out
 * here. What is emulated is the platform around them: `auth`, the three client
 * roles, the default privileges, and the `storage` / `cron` / `net` / `vault`
 * stubs. A test that asserts about those stubs is asserting about this file.
 */
export async function createSupabaseTestDb(): Promise<SupabaseTestDb> {
  const fingerprint = ledgerFingerprint();
  const admin = adminConnection();
  const startedAt = Date.now();
  let templateRebuilt = false;
  let replay: ReplayResult | null = null;

  try {
    await acquireTemplateLock(admin);
    try {
      if (await templateIsFresh(admin, fingerprint)) {
        // Nothing to do. Another process may have just built it while this one
        // waited on the lock, which is the whole reason the freshness check is
        // repeated after acquiring rather than only before.
        replay = null;
      } else {
        replay = await buildTemplate(admin, fingerprint);
        templateRebuilt = true;
      }
    } finally {
      await admin.unsafe(
        `select pg_advisory_unlock(hashtextextended('${TEMPLATE_LOCK_KEY}', 0))`,
      );
    }
    const templateWaitMs = Date.now() - startedAt;

    const dbName = `rls_${randomSuffix()}`;
    // `CREATE DATABASE ... TEMPLATE` refuses to run while anything is connected
    // to the template, and `templateIsFresh` opens and closes a probe connection
    // every call. Draining first costs one statement and removes a flake whose
    // symptom — `source database is being accessed by other users` — says
    // nothing about the code under test.
    await admin.unsafe(
      `select pg_terminate_backend(pid) from pg_stat_activity
        where datname = '${TEMPLATE_DB}' and pid <> pg_backend_pid()`,
    );
    await admin.unsafe(`create database "${dbName}" template "${TEMPLATE_DB}"`);

    const url = new URL(BASE_URL);
    url.pathname = `/${dbName}`;
    const client = postgres(url.toString(), {
      prepare: false,
      // `max: 1` so that `as()`'s `set local role` and the query that depends on
      // it are guaranteed to land on the same backend. postgres.js rejects an
      // explicit BEGIN inside a multi-statement query on a non-reserved
      // connection (UNSAFE_TRANSACTION), and a role that leaked onto the next
      // test's connection would be a silently wrong assertion.
      max: 1,
      onnotice: () => {},
    });

    let stopped = false;
    const db: SupabaseTestDb = {
      sql: client,
      dbName,
      connectionString: url.toString(),
      replay: replay ?? (await readTemplateReplay(client)),
      fingerprint,
      templateRebuilt,
      templateWaitMs,
      stop: async () => {
        if (stopped) return;
        stopped = true;
        await client.end({ timeout: 5 });
        const killer = adminConnection();
        try {
          await killer.unsafe(
            `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${dbName}'`,
          );
          await killer.unsafe(
            `drop database if exists "${dbName}" with (force)`,
          );
        } finally {
          await killer.end({ timeout: 5 });
        }
      },
    };
    return db;
  } finally {
    await admin.end({ timeout: 5 });
  }
}

/**
 * The replay result recorded inside a reused template.
 *
 * A test that pins the ledger's known failures must be able to read them from a
 * database whose template was built by an earlier process, so the summary is
 * persisted alongside the schema instead of only living in the return value of
 * the build that happened to run in this process.
 */
async function readTemplateReplay(sql: Sql): Promise<ReplayResult> {
  // `replay::text`, not `replay`. `unsafe()` has no type information, so
  // postgres.js hands a `jsonb` column back as the raw string and the
  // `JSON.parse` has to happen here. Reading the column directly returns
  // `{applied: 0, failures: [], skipped: 0}` for a summary that holds 937
  // statements and seven failures — which would have made the ledger fixture
  // assert that the debt was empty, in a suite whose whole purpose is to prove
  // the debt is visible.
  const rows = await sql.unsafe(
    `select replay::text as replay from ${FINGERPRINT_TABLE} where id = 1`,
  );
  const raw = (rows[0] as { replay?: string } | undefined)?.replay;
  if (!raw) {
    throw new Error(
      `${TEMPLATE_DB} has no fingerprint row but was reported fresh; the template ` +
        `and this harness disagree. Delete the template and re-run.`,
    );
  }
  const parsed = JSON.parse(raw) as Partial<ReplayResult>;
  return {
    applied: Number(parsed.applied ?? 0),
    failures: parsed.failures ?? [],
    skipped: parsed.skipped ?? [],
  };
}

/** 12 hex chars. Enough to keep names unique across a parallel test run. */
function randomSuffix(): string {
  return Math.random().toString(16).slice(2, 14).padEnd(12, '0');
}

/** The roles a test may impersonate. Anything else is a bug in the caller. */
export type ImpersonatedRole = 'anon' | 'authenticated' | 'service_role';

const IMPERSONATABLE: readonly string[] = [
  'anon',
  'authenticated',
  'service_role',
];

/**
 * Run `fn` as a Supabase client role, inside one transaction.
 *
 * ─── The mechanism ─────────────────────────────────────────────────────────
 *
 * `auth.uid()` is a `current_setting('request.jwt.claim.sub')` read, so becoming
 * a user is a GUC, not a connection. Production gets there through PostgREST,
 * which sets `role` and the JWT claims per request. Here it is done by hand:
 *
 *     begin;
 *     set local role authenticated;
 *     select set_config('request.jwt.claim.sub', '<uuid>', true);
 *     select * from public.orders;   -- now filtered by that user's policies
 *     commit;
 *
 * `set local` is what keeps one persona from leaking into the next assertion.
 * Both the role and the claims are transaction-scoped and are discarded when
 * the transaction ends, so there is nothing to clean up and nothing to forget.
 *
 * The roles are declared `nologin`, so there is no password to bypass: the
 * privilege comes from `set role` alone, and that is also the trap. A session
 * that never sets a role runs as the owner and BYPASSES RLS, so a test that
 * forgets would pass while asserting the opposite of what it means. The
 * `categories` spec carries a meta-test for exactly this.
 *
 * ─── Why the callback receives the transaction ─────────────────────────────
 *
 * Because `set local role` is illegal outside a transaction, so the role has to
 * be established before the callback can run. The callback therefore cannot be
 * a plain function over the pool; it gets the transaction's own connection, and
 * everything it does is atomic with the impersonation and disappears on
 * rollback.
 *
 * ─── `userId: null` ────────────────────────────────────────────────────────
 *
 * That is the anonymous path, and it is a real one to test: `auth.uid()`
 * returns NULL, every `auth.uid() = ...` predicate is NULL, and a policy written
 * as `using (owner_id = auth.uid())` filters everything out rather than
 * everything in. An impersonation that always supplies a subject cannot tell
 * those two apart.
 *
 * ─── The abort trap ────────────────────────────────────────────────────────
 *
 * A statement that fails puts the transaction in the aborted state, and the
 * NEXT statement in the same transaction fails with 25P02 regardless of what it
 * says. A test that wants to observe a denial and then keep querying must
 * therefore use two `as()` calls, or `deniedAs()` below. This is not a
 * workaround; it is how Postgres transactions work.
 */
export async function as<T>(
  sql: Sql,
  role: ImpersonatedRole,
  userId: string | null,
  fn: (tx: Sql) => Promise<T>,
): Promise<T> {
  assertImpersonatable(role);
  const result = await sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${role}`);
    if (userId !== null) {
      // Both claim forms, because production carries both: PostgREST sets the
      // single `sub` GUC, and some client paths send the whole claims object.
      // `auth.uid()` prefers one and falls back to the other, and a harness that
      // only set one would pass while real traffic failed.
      await tx.unsafe(
        `select set_config('request.jwt.claim.sub', '${userId}', true), ` +
          `set_config('request.jwt.claim.role', '${role}', true), ` +
          `set_config('request.jwt.claims', '${JSON.stringify({ sub: userId, role })}', true)`,
      );
    }
    // `TransactionSql` is a superset of `Sql`, so the cast is sound; it is
    // needed because the generic parameter postgres.js infers for a
    // transaction callback is not the one the caller declared.
    return await fn(tx as unknown as Sql);
  });
  // `begin<T>` is declared to return `UnwrapPromiseArray<T>`, which is not
  // assignable back to `T` for an arbitrary T. The value is exactly what the
  // callback returned.
  return result as T;
}

/**
 * The negative form of `as()`: run `fn` as a role and hand back the error
 * instead of throwing it.
 *
 * Returns `null` when the statement SUCCEEDED. That is the interesting result —
 * "the write nobody should be able to make went through" — so it is a value and
 * not an exception: a test asserting a denial has to say so, and the honest
 * way to say it is to have the harness hand back the absence of a failure.
 *
 * The transaction is always rolled back, so the data is untouched whether the
 * statement was refused or not.
 */
export async function deniedAs<T>(
  sql: Sql,
  role: ImpersonatedRole,
  userId: string | null,
  fn: (tx: Sql) => Promise<T>,
): Promise<{ code: string; message: string } | null> {
  assertImpersonatable(role);
  try {
    await as(sql, role, userId, fn);
    return null;
  } catch (error) {
    // Renamed from `msg` on the way out. `describeError` abbreviates for the
    // replay fixtures, where a hundred of these are compared at once; a spec
    // reads one, and `message` is what a reader expects. Getting this wrong
    // once already produced four tests that asserted on `undefined` and read as
    // policy failures.
    const { code, msg } = describeError(error);
    return { code, message: msg };
  }
}

/**
 * Reject a role the harness does not define, before it reaches a string
 * interpolation.
 *
 * The union type already says this, but the value arrives as a `string` at
 * runtime and `set local role` takes free text — including a session-scoped
 * `set role postgres`, which would silently turn a denial test into a pass.
 */
function assertImpersonatable(role: string): asserts role is ImpersonatedRole {
  if (!IMPERSONATABLE.includes(role)) {
    throw new Error(
      `${role} is not a role this harness can impersonate. Expected one of: ` +
        `${IMPERSONATABLE.join(', ')}.`,
    );
  }
}
