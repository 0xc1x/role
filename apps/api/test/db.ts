import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

export type TestDatabase = PostgresJsDatabase;

export interface TestDbContext {
  db: TestDatabase;
  connectionString: string;
  stop: () => Promise<void>;
}

/** Base del Postgres de test: `docker compose up postgres-test` o CI. */
const BASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@localhost:6432/role_test';

/**
 * Drizzle genera migraciones incrementales, so the mirror is the CONCATENATION
 * of every folder, in name order. Reading only the first non-meta folder looked
 * equivalent while the working copy happened to have a stale one, and silently
 * tested against an old schema: locally the first folder lacked a constraint
 * that a later folder added, so the manual ALTER below succeeded. On CI only
 * the latest folder exists, the constraint is already there, and the ALTER
 * failed with 42P07, taking 48 database specs down with it.
 */
async function loadInitSql(): Promise<string> {
  const dir = join(__dirname, '..', 'drizzle');
  const entries = (await readdir(dir))
    .filter((e) => e !== 'meta' && !e.startsWith('.'))
    .sort();
  if (entries.length === 0) throw new Error('Sin migraciones en drizzle/');

  const chunks: string[] = [];
  for (const folder of entries) {
    const raw = await readFile(join(dir, folder, 'migration.sql'), 'utf8');
    // drizzle-kit pull envuelve el SQL en /* ... */ ("uncomment to run"); lo desenvolvemos.
    const open = raw.indexOf('/*');
    const close = raw.lastIndexOf('*/');
    chunks.push(
      open === -1 || close === -1 || close < open
        ? raw
        : raw.slice(0, open) + raw.slice(open + 2, close) + raw.slice(close + 2),
    );
  }
  return chunks.join('\n--> statement-breakpoint\n');
}

const INIT_SQL = loadInitSql();

/**
 * DATABASE fresca por archivo sobre el Postgres de test compartido.
 * DDL generado offline desde el schema Drizzle (`drizzle-kit generate`);
 * Supabase sigue siendo dueño del DDL real — esto solo levanta un espejo.
 */
export async function createTestDb(): Promise<TestDbContext> {
  const base = new URL(BASE_URL);
  const admin: Sql = postgres(BASE_URL, {
    prepare: false,
    max: 1,
    database: 'postgres',
  });

  const dbName = `test_${randomUUID().replaceAll('-', '')}`;
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  await admin.end({ timeout: 5 });

  base.pathname = `/${dbName}`;
  const client = postgres(base.toString(), { prepare: false, max: 5 });
  await client`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  // El espejo de test corre en postgres pelado: sin auth/PostGIS ni roles de
  // Supabase. Policies, grants y FKs enteras a auth.users se descartan; las
  // FKs inline dentro de CREATE TABLE pierden solo el REFERENCES (la columna
  // queda). geog ya se excluyó del baseline a mano (memoria workflow DDL).
  const parts = (await INIT_SQL)
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(
      (s) =>
        !/CREATE\s+POLICY|^\s*GRANT\s|^\s*REVOKE\s|auth\.(uid|jwt|role)\(/i.test(
          s,
        ),
    )
    .filter(
      (s) => !/ADD CONSTRAINT[^;]*REFERENCES\s+"?auth"?\."?users"?/i.test(s),
    )
    .map((s) =>
      s.replace(/\s*REFERENCES\s+"?auth"?\."?users"?\s*\([^)]*\)/g, ''),
    );
  for (let i = 0; i < parts.length; i += 25) {
    await client.unsafe(parts.slice(i, i + 25).join(';\n'));
  }

  // The checked-in Drizzle mirror intentionally omits Supabase functions,
  // triggers, RLS and PostGIS. Install only the reservation/order primitives
  // exercised by DB specs so those tests do not pass on trigger-less tables.
  //
  // Not repeated here, because the mirror already carries them and re-adding
  // raises 42P07: the composite unique on business_locations(id, business_id),
  // the offers_location_business_fkey composite foreign key, and the orders
  // idempotency_key column. What remains is the check constraint, the partial
  // unique index, the sequence, and the functions and triggers that Drizzle
  // cannot model.
  //
  // Two more that the live database does have and the mirror does not: the
  // unique constraints behind `user_preferences_user_id` and
  // `user_consents(user_id, consent_type)`. The user-defaults seeding mirrors
  // the trigger ON CONFLICT clauses verbatim, and without those constraints
  // Postgres rejects the inference with 42P10 — the spec would then be testing a
  // database that cannot express the production statement.
  //
  // `favorites(user_id, offer_id)` is that same situation for the same reason:
  // the favorites add is idempotent through `ON CONFLICT (user_id, offer_id) DO
  // NOTHING`, so the constraint it infers against is what makes a second save
  // of the same offer a no-op instead of a 23505. See the MIRROR GAP note in
  // src/database/schema/favorites.ts for why the constraint is not declared there.
  //
  // ─── Object-shape gap: the review and schedule objects ────────────────
  //
  // Everything above is a CONSTRAINT or a FUNCTION the mirror declares the
  // columns of. The three blocks below are different: the mirror does not
  // declare these objects AT ALL, and the specs that exercise the public
  // storefront and the review feeds need them to exist.
  //
  // They are installed here rather than generated into `drizzle/` on purpose.
  // The live database is owned by Supabase and the Drizzle folders are an
  // offline mirror of it (`drizzle.config.ts`: "Supabase owns DDL. Use
  // pull/introspect only — do not push migrations from the API"), so a
  // hand-written CREATE TABLE in a migration folder would claim the API applied
  // DDL it never applied, and `drizzle-kit generate` is the only sanctioned way
  // to grow that mirror. Copying an existing Supabase object into the harness
  // keeps the change to the one file that already documents this class of gap.
  //
  // What each block is and why a spec cannot do without it:
  //
  //  1. `reviews` moderation columns. The mirror was pulled before
  //     `20260927021015_reviews_moderation_soft_hide.sql` added `is_hidden`,
  //     `moderated_at`, `moderated_by` and `hidden_reason` (only the later
  //     `moderation_reason` column is in a Drizzle folder). A feed that filters
  //     `is_hidden = false` would fail with 42703, and a spec that could not
  //     write a hidden row could not prove that a hidden row stays out of a
  //     public feed — the single behaviour the moderation policy exists for.
  //  2. The three `reviews` partial indexes. The public feed's whole cost story
  //     is `idx_reviews_visible_business_created (business_id, created_at desc)
  //     where is_hidden = false`; without it the harness cannot show that the
  //     feed and its count are served by that index instead of a sequential
  //     scan. `idx_reviews_user` is here for the same reason on the "my" feed.
  //  3. `business_hours`. The table has existed in Supabase since the businesses
  //     migration and the mobile reads it straight from PostgREST, but the API
  //     never declared it, so the storefront's schedule had no way to be read.
  //     See the MIRROR GAP note in src/database/schema/business-hours.ts.
  //  4. `saved_addresses`. The consumer address book, managed by mobile
  //     straight through PostgREST and by the API's owner-scoped routes. Same
  //     shape of gap as `business_hours`: the table is real in Supabase, nothing
  //     in `drizzle/` declares it, and the specs that exercise the default-flag
  //     transaction need it to exist. Its `idx_saved_addresses_user` is installed
  //     with it because every read in the module is `where user_id = $1`; the
  //     live `set_saved_addresses_updated_at` trigger is deliberately NOT copied
  //     — the repository writes `updated_at` explicitly, as every other
  //     repository here already does. See the MIRROR GAP note in
  //     src/database/schema/saved-addresses.ts.
  //
  // All four are `if not exists` because the harness runs per spec file against
  // a fresh database: the idempotence is there so a future mirror that DOES
  // carry them does not raise 42P07 or 42701 and take the whole suite down.
  await client.unsafe(`
    do $$
    begin
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'reviews'
          and column_name = 'is_hidden'
      ) then
        alter table public.reviews
          add column is_hidden boolean not null default false,
          add column moderated_at timestamp with time zone,
          add column moderated_by uuid references public.profiles (id) on delete set null,
          add column hidden_reason text;
      end if;
    end
    $$;

    create index if not exists idx_reviews_visible_business_created
      on public.reviews (business_id, created_at desc)
      where is_hidden = false;
    create index if not exists idx_reviews_hidden_created
      on public.reviews (created_at desc)
      where is_hidden = true;
    create index if not exists idx_reviews_user
      on public.reviews (user_id);
    create index if not exists idx_reviews_order_id
      on public.reviews (order_id);

    create table if not exists public.business_hours (
      id uuid primary key default gen_random_uuid(),
      business_id uuid not null references public.businesses (id) on delete cascade,
      day public.day_of_week not null,
      open_time time not null,
      close_time time not null,
      is_closed boolean not null default false,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now(),
      constraint business_hours_business_id_day_key unique (business_id, day)
    );

    create table if not exists public.saved_addresses (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles (id) on delete cascade,
      label text not null,
      address text not null,
      latitude numeric not null,
      longitude numeric not null,
      is_default boolean not null default false,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now(),
      "type" text not null default 'home',
      -- "references" is a reserved word: unquoted it is a syntax error (42601).
      "references" text,
      housing_type text
    );
    create index if not exists idx_saved_addresses_user
      on public.saved_addresses (user_id);
  `);

  await client.unsafe(`
    alter table public.user_preferences
      add constraint user_preferences_user_id_key unique (user_id);
    alter table public.user_consents
      add constraint user_consents_user_id_consent_type_key
      unique (user_id, consent_type);
    alter table public.favorites
      add constraint favorites_user_id_offer_id_key unique (user_id, offer_id);

    alter table public.offers
      alter column is_active set default false;
    alter table public.orders
      add constraint orders_idempotency_key_length
      check (
        idempotency_key is null
        or (length(idempotency_key) between 1 and 128)
      );
    create unique index orders_user_idempotency_key_unique
      on public.orders(user_id, idempotency_key)
      where idempotency_key is not null;

    create sequence if not exists public.order_number_seq as bigint;
    select setval('public.order_number_seq', 1, false);
    create or replace function public.generate_order_number()
    returns text
    language plpgsql
    set search_path = ''
    as $function$
    declare
      next_seq bigint := nextval('public.order_number_seq');
    begin
      return 'FD-' || to_char(now(), 'YYYY-MMDD') || '-' ||
        lpad(next_seq::text, 3, '0');
    end;
    $function$;

    create or replace function public.enforce_offer_business_availability()
    returns trigger
    language plpgsql
    set search_path = ''
    as $function$
    begin
      -- verification_status vive en business_moderation: se consulta aparte
      -- para no exigir la fila del companion (misma semántica que la columna
      -- NOT NULL con default 'pending': sin fila, no está aprobado).
      if not exists (
        select 1
        from public.businesses b
        where b.id = new.business_id
          and b.is_active = true
      ) or not exists (
        select 1
        from public.business_moderation m
        where m.business_id = new.business_id
          and m.verification_status = 'approved'
      ) then
        new.is_active := false;
      end if;
      return new;
    end;
    $function$;

    create trigger enforce_offer_business_availability
      before insert or update of business_id, business_location_id, is_active
      on public.offers
      for each row
      execute function public.enforce_offer_business_availability();

    create or replace function public.record_order_event()
    returns trigger
    language plpgsql
    set search_path = ''
    as $function$
    begin
      if tg_op = 'INSERT' then
        insert into public.order_events (
          order_id, status, previous_status, changed_by, reason, metadata
        ) values (
          new.id, new.status, null, null, 'Reserva creada',
          '{"source":"database"}'::jsonb
        );
      elsif old.status is distinct from new.status then
        insert into public.order_events (
          order_id, status, previous_status, changed_by, reason, metadata
        ) values (
          new.id, new.status, old.status,
          nullif(current_setting('role.order_event_actor', true), '')::uuid,
          null,
          '{"source":"database"}'::jsonb
        );
      end if;
      return new;
    end;
    $function$;

    create trigger record_order_event
      after insert or update on public.orders
      for each row
      execute function public.record_order_event();

    create or replace function public.business_completed_orders_count(p_business_id uuid)
    returns bigint
    language sql
    stable
    security definer
    set search_path = ''
    as $function$
      select count(*)::bigint
      from public.orders
      where business_id = p_business_id
        and status = 'completed'::public.order_status
    $function$;
  `);

  const db: TestDatabase = drizzle({ client });
  let stopped = false;
  return {
    db,
    connectionString: base.toString(),
    stop: async () => {
      if (stopped) return;
      stopped = true;
      const killer: Sql = postgres(BASE_URL, {
        prepare: false,
        max: 1,
        database: 'postgres',
      });
      await client.end({ timeout: 5 });
      await killer.unsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}'`,
      );
      await killer.unsafe(`DROP DATABASE "${dbName}"`);
      await killer.end({ timeout: 5 });
    },
  };
}
