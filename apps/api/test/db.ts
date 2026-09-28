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
        : raw.slice(0, open) +
            raw.slice(open + 2, close) +
            raw.slice(close + 2),
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
  // El espejo de test corre en Postgres pelado: sin auth ni roles de Supabase.
  // Policies, grants y FKs enteras a auth.users se descartan; las FKs inline
  // dentro de CREATE TABLE pierden solo el REFERENCES (la columna queda).
  // geog ya se excluyó del baseline a mano (memoria workflow DDL).
  //
  // PostGIS IS here, and in the SAME schema Supabase uses. That is why the
  // service image is `postgis/postgis` instead of `postgres:`, and why the
  // extension is created into the `extensions` schema on purpose: the runtime
  // reaches it as `extensions.st_*` — the raw SQL of GET /offers does not
  // resolve PostGIS without that schema qualification. It goes in BEFORE the
  // mirror's DDL so any future migration touching `geography` resolves. This
  // session's search_path does NOT include `extensions`, so the rest of the DDL
  // still cannot resolve an unqualified `st_*` — which is the same discipline
  // production relies on, and item 5 below reproduces it deliberately.
  await client.unsafe(`
    create schema if not exists extensions;
    create extension if not exists postgis schema extensions;
  `);
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
  // PostGIS is the odd one out: it is not patched into the mirror's tables but
  // into the DATABASE (see item 5 below), because the whole point of the geo
  // path of GET /offers is to be executed, not to be compiled.
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
  // `coupons(business_id, code)` is the fourth member of that class. Postgres
  // treats NULLs as DISTINCT in a unique index, so it does NOT stop two
  // platform-wide coupons from sharing a code, which is what leaves the
  // `limit(1)` of the coupon resolution read ambiguous; the redemption lookup
  // and the checkout pre-check both rank by that resolution, so a difference
  // between them shows up as a code the pre-check approves and the reservation
  // rejects as `wrong_business`. `CouponsService.assertGlobalCodeAvailable` is
  // the service-level half of the promise. See the MIRROR GAP note in
  // src/database/schema/coupons.ts for why the constraint is not declared there.
  //
  // ─── Object-shape gap: the review, schedule and geo objects ────────────
  //
  // Everything above is a CONSTRAINT or a FUNCTION the mirror declares the
  // columns of. The blocks below are different: the mirror does not declare
  // these objects AT ALL, and the specs that exercise the public storefront,
  // the review feeds and the geo search need them to exist.
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
  //  5. `payment_methods`. The tokenized-card table, read and written by mobile
  //     through PostgREST and served by the API's owner-scoped routes. Same
  //     shape of gap again, and the reason it is NOT a bare `create table` is
  //     the two CHECKs, which are the only thing in the schema able to keep
  //     `exp_month = 0`, `exp_month = 13` or a `last4` that is not four
  //     characters out of the table:
  //
  //       payment_methods_exp_month_check   CHECK (exp_month >= 1 AND exp_month <= 12)
  //       payment_methods_last4_check       CHECK (char_length(last4) = 4)
  //
  //     Drizzle cannot express a CHECK here without a schema-level `.check()`,
  //     and a schema-level `.check()` is DDL that `drizzle-kit generate` would
  //     emit for constraints production has held since
  //     `20260822231809_commissions_payouts_payment_methods` — see the MIRROR
  //     GAP note in src/database/schema/payment-methods.ts. So they are installed
  //     here, in the harness's own DDL, and the payment-methods specs assert
  //     they are really there: a harness that dropped them would let exactly the
  //     bad rows production forbids into the test database and the suite would
  //     be green.
  //
  //     `gateway_token` is declared because the COLUMN exists — the row is what
  //     the database holds, and the PCI rule is a rule about the projection, not
  //     about storage. What the specs pin is that it never reaches a response.
  //
  //     `idx_payment_methods_user` is installed with the table, and it is NOT
  //     unique: production has no unique constraint on `(user_id)`. Production
  //     DOES now have `idx_payment_methods_one_default` — the partial unique
  //     index `20260928040349_payment_methods_one_default` added — and it is
  //     deliberately NOT installed here, for the same reason
  //     `20260927141632_saved_addresses_one_default`'s index is not installed
  //     with `saved_addresses` above: a spec that wants to observe the API's own
  //     clear-then-set transaction has to be able to produce the state the
  //     transaction exists to prevent. With the index present, every "two
  //     defaults are writable" assertion becomes a 23505 and the transaction is
  //     never exercised. The specs that assert it say explicitly that they are
  //     pinning the HARNESS and not production.
  //
  //     NO `updated_at` TRIGGER, deliberately and verified: no trigger maintains
  //     `updated_at` on the live `public.payment_methods`. The only two
  //     migrations that touch the table are the one that creates it and
  //     `20260925155451_performance_advisors` (index + policy), and neither
  //     creates a trigger — contrast `saved_addresses`, whose
  //     `set_saved_addresses_updated_at` trigger IS a real object that this
  //     mirror also omits. So the repository writes `updated_at` explicitly, and
  //     giving the test database a trigger production does not have would let a
  //     stale `updated_at` pass for the right reason.
  //
  // All five are `if not exists` because the harness runs per spec file against
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

    -- The tokenized-card table. Columns and types are the live ones; the two
    -- CHECK constraints are the load-bearing part (see item 5 above) and are
    -- inline here because Drizzle cannot carry them into this mirror.
    --
    -- gateway is written with the bare payment_gateway enum, which this
    -- harness does have: the enums arrive with the drizzle/ mirror DDL.
    -- user_id references public.profiles rather than auth.users, matching the
    -- Drizzle mirror's own documented divergence -- auth.users does not exist
    -- on a bare Postgres, which is the same reason the harness strips
    -- REFERENCES auth.users out of the mirror DDL above.
    --
    -- No backticks in this comment on purpose: the SQL below lives inside a
    -- JS template literal, so one of them would end the string.
    create table if not exists public.payment_methods (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles (id) on delete cascade,
      gateway payment_gateway not null default 'place_to_pay',
      gateway_token text not null,
      brand text not null,
      last4 text not null,
      exp_month int not null,
      exp_year int not null,
      holder_name text not null,
      is_default boolean not null default false,
      active boolean not null default true,
      created_at timestamp with time zone not null default now(),
      updated_at timestamp with time zone not null default now(),
      deleted_at timestamp with time zone,
      constraint payment_methods_exp_month_check
        check (exp_month >= 1 and exp_month <= 12),
      constraint payment_methods_last4_check
        check (char_length(last4) = 4)
    );
    create index if not exists idx_payment_methods_user
      on public.payment_methods (user_id);
  `);

  //  6. `business_locations.geog` and its GIST index. Same class of gap, and the
  //     one that made the geo path of `GET /offers` untestable rather than
  //     merely untested: the radius filter (`extensions.st_dwithin`) and the
  //     `distance_km` projection (`extensions.st_distance`) both go through
  //     this generated column, so with a PostGIS-less harness every spec that
  //     touched the path could only assert the SHAPE of the compiled SQL
  //     (`.toSQL()`), never that Postgres accepts it or evaluates it.
  //
  //     The expectations below were read from the LIVE Supabase database, not
  //     inferred — re-verify them there before changing anything:
  //
  //       - the `postgis` extension, version 3.3.7, installed in schema
  //         `extensions` (hence `create extension ... schema extensions` above).
  //       - `business_locations.geog` is `geography`, NULLABLE, and GENERATED
  //         ALWAYS, holding this expression:
  //
  //             (st_setsrid(
  //               st_makepoint((longitude)::double precision, (latitude)::double precision),
  //               4326
  //             ))::geography
  //
  //         The `::double precision` casts are not decoration: `latitude` and
  //         `longitude` are `numeric(10,7)` and `st_makepoint` takes doubles, so
  //         the cast is what makes the column's stored expression legal.
  //         Note the argument order: `st_makepoint(longitude, latitude)` — X
  //         first. Swapping it is the classic way to get a plausible-but-wrong
  //         distance, and the specs below assert the order by seeding a
  //         location displaced along ONE axis and checking the number.
  //
  //         `STORED` is not optional: PostgreSQL's grammar requires it on a
  //         generated column, and without it every form above is a 42601. Note
  //         also that the cast sits INSIDE the generation parentheses —
  //         `generated always as (<expr>)::geography` is a 42601 too. The
  //         form in the notes above is the one that parses, and it stores the
  //         same expression; to confirm the two databases agree, render it in
  //         both with `extensions` on the search_path (`pg_get_expr` qualifies
  //         PostGIS names exactly when the extension schema is NOT visible) and
  //         compare:
  //
  //           (st_setsrid(st_makepoint((longitude)::double precision,
  //             (latitude)::double precision), 4326))::geography
  //
  //       - `CREATE INDEX business_locations_geog_idx ON public.business_locations
  //         USING gist (geog)` — the index the `st_dwithin` filter exists to
  //         use, installed here so the harness holds the same index production
  //         does instead of silently answering the filter with a sequential
  //         scan and per-row trigonometry.
  //
  //     WHY THE EXPRESSION IS UNQUALIFIED HERE, AND WHY THAT IS FAITHFUL: in
  //     production the stored expression reads as a bare `st_setsrid` /
  //     `st_makepoint`, because Supabase applies migrations with `extensions`
  //     on the `search_path` — and `pg_get_expr` renders it that way only for
  //     that reason. This harness therefore reproduces the resolution
  //     MECHANISM rather than rewriting the DDL to be schema-qualified:
  //     rewriting the expression to `extensions.st_*` would apply a different
  //     statement than the one production holds, and it would hide the very fact
  //     that production depends on this search_path.
  //
  //     Two details make that mechanism safe here.
  //
  //     `set search_path` + `reset search_path` rather than a transaction. The
  //     obvious `begin; set local search_path = ...; ...; commit;` does NOT work
  //     in this harness: postgres.js rejects an explicit BEGIN inside a
  //     multi-statement query unless the connection is reserved or the pool is
  //     `max: 1` (UNSAFE_TRANSACTION), and this client is `max: 5`. Setting and
  //     resetting inside ONE `unsafe` call is a single simple-query round trip,
  //     so both statements land on the same reserved connection and the
  //     widening cannot leak into a later query the spec runs.
  //
  //     Both objects are named `public.*` explicitly, so the temporary
  //     search_path moves type and function resolution and nothing else: the
  //     column goes on `public.business_locations` and the index lands in the
  //     same schema, not in `extensions`.
  //
  //     Also `if not exists`, for the reason the four blocks above are.
  await client.unsafe(`
    set search_path = extensions, public;
    alter table public.business_locations
      add column if not exists geog geography
      generated always as (
        st_setsrid(
          st_makepoint(
            (longitude)::double precision,
            (latitude)::double precision
          ),
          4326
        )::geography
      ) stored;
    create index if not exists business_locations_geog_idx
      on public.business_locations using gist (geog);
    reset search_path;
  `);

  await client.unsafe(`
    alter table public.user_preferences
      add constraint user_preferences_user_id_key unique (user_id);
    alter table public.user_consents
      add constraint user_consents_user_id_consent_type_key
      unique (user_id, consent_type);
    alter table public.favorites
      add constraint favorites_user_id_offer_id_key unique (user_id, offer_id);
    -- The fourth member of the constraint class documented above: see the note
    -- on coupons(business_id, code) in the comments of this file, and the
    -- MIRROR GAP note in src/database/schema/coupons.ts for why it is patched
    -- here instead of declared in the mirror.
    alter table public.coupons
      add constraint coupons_business_id_code_key unique (business_id, code);
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

    -- Rating triggers, verbatim from the live database. Added because
    -- DELETE /api/v1/auth/account deletes the caller's reviews and relies on
    -- these to rewrite the averages: without them the harness proves the rows
    -- are gone while the numbers stay frozen, which is the same shape of blind
    -- spot as the referential-action drift. The is_hidden column is required by
    -- both bodies and is installed by the moderation block above.
    create or replace function public.update_business_rating()
    returns trigger language plpgsql security definer set search_path = ''
    as $rating_fn$
    declare
      v_business_id uuid;
    begin
      if tg_op = 'DELETE' then
        v_business_id := old.business_id;
      else
        v_business_id := new.business_id;
      end if;

      update public.businesses
      set
        rating = (
          select coalesce(avg(r.business_rating), 0)
          from public.reviews r
          where r.business_id = v_business_id
            and r.is_hidden is not true
        ),
        review_count = (
          select count(*)
          from public.reviews r
          where r.business_id = v_business_id
            and r.is_hidden is not true
        )
      where id = v_business_id;

      return coalesce(new, old);
    end;
    $rating_fn$;

    create or replace function public.update_offer_rating()
    returns trigger language plpgsql security definer set search_path = ''
    as $rating_fn$
    declare
      v_offer_id uuid;
    begin
      if tg_op = 'DELETE' then
        select offer_id into v_offer_id from public.orders where id = old.order_id;
      else
        select offer_id into v_offer_id from public.orders where id = new.order_id;
      end if;

      if v_offer_id is not null then
        update public.offers
        set
          rating = (
            select coalesce(avg(r.product_rating), 0)
            from public.reviews r
            join public.orders o on o.id = r.order_id
            where o.offer_id = v_offer_id
              and r.is_hidden is not true
          ),
          review_count = (
            select count(*)
            from public.reviews r
            join public.orders o on o.id = r.order_id
            where o.offer_id = v_offer_id
              and r.is_hidden is not true
          )
        where id = v_offer_id;
      end if;

      return coalesce(new, old);
    end;
    $rating_fn$;

    drop trigger if exists on_review_change on public.reviews;
    create trigger on_review_change
      after insert or delete or update on public.reviews
      for each row
      execute function public.update_business_rating();

    drop trigger if exists on_review_offer_change on public.reviews;
    create trigger on_review_offer_change
      after insert or delete or update on public.reviews
      for each row
      execute function public.update_offer_rating();

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
