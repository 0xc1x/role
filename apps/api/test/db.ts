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

  // The Drizzle mirror intentionally omits Supabase functions, triggers, RLS
  // and PostGIS. Install only the reservation/order primitives exercised by DB
  // specs so those tests do not pass on trigger-less tables. PostGIS is the odd
  // one out: it is not patched into the mirror's tables but into the DATABASE
  // (see item 6 below), because the whole point of the geo path of GET /offers
  // is to be executed, not to be compiled.
  //
  // Not repeated here, because the mirror already carries them and re-adding
  // raises 42P07: the composite unique on business_locations(id, business_id),
  // the offers_location_business_fkey composite foreign key, the orders
  // idempotency_key column, `offers.is_active DEFAULT false` (an `alter column
  // set default` that used to be repeated here — idempotent, so it never
  // errored, but it hid the fact that the mirror already carried the default),
  // and every TABLE — including the `payment_methods_exp_month_check` and
  // `payment_methods_last4_check` CHECKs, which are declared as table-level
  // `.check()` in the schema for exactly the reason spelled out in the block
  // below. What remains is the orders idempotency CHECK, the partial unique
  // indexes, the sequence, and the functions and triggers that Drizzle cannot
  // model.
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
  // ─── Object-shape gap: indexes and geo ──────────────────────────────────
  //
  // Everything above is a CONSTRAINT or a FUNCTION over columns the mirror
  // declares. The block below is different: the mirror does not declare these
  // INDEXES at all, and the specs that exercise the public review feeds and the
  // address book need them to exist.
  //
  // They are installed here rather than generated into `drizzle/` on purpose.
  // The live database is owned by Supabase and the Drizzle folders are an
  // offline mirror of it (`drizzle.config.ts`: "Supabase owns DDL. Use
  // pull/introspect only — do not push migrations from the API"), and
  // `drizzle-kit generate` is the only sanctioned way to grow that mirror.
  //
  // TABLES AND CHECK CONSTRAINTS ARE NOT IN THIS CLASS ANYMORE. They used to
  // be: `business_hours`, `saved_addresses` and `payment_methods` each had a
  // hand-written `create table if not exists` here alongside their declaration
  // in the schema. The mirror emits its own `CREATE TABLE` first, the `if not
  // exists` made the harness copy a silent no-op (a NOTICE, not an error), and
  // for `payment_methods` that silently dropped the two CHECK constraints —
  // which is the only thing in the schema that can keep `exp_month = 0` or a
  // three-character `last4` out. Three specs caught it; the 2204 that did not
  // look could not have. The tables and those CHECKs are declared in
  // `src/database/schema/` and generated like everything else now, so the two
  // can no longer disagree.
  //
  // What each block below is, and why a spec cannot do without it:
  //
  //  1. The four `reviews` indexes. The public feed's whole cost story is
  //     `idx_reviews_visible_business_created (business_id, created_at desc)
  //     where is_hidden = false`; without it the harness cannot show that the
  //     feed and its count are served by that index instead of a sequential
  //     scan. `idx_reviews_user` is here for the same reason on the "my" feed,
  //     `idx_reviews_order_id` because the order-detail view joins through it.
  //     (The `reviews` moderation COLUMNS — `is_hidden`, `moderated_at`,
  //     `moderated_by`, `hidden_reason`, `moderation_reason` — are declared in
  //     `src/database/schema/reviews.ts` and come from the mirror; a feed that
  //     filters `is_hidden = false` needs them, and a spec that could not write
  //     a hidden row could not prove that a hidden row stays out of a public
  //     feed, which is the single behaviour the moderation policy exists for.)
  //  2. `idx_saved_addresses_user`. Every read in the address-book module is
  //     `where user_id = $1`. The live `set_saved_addresses_updated_at` trigger
  //     is deliberately NOT copied — the repository writes `updated_at`
  //     explicitly, as every other repository here already does. See the note in
  //     src/database/schema/saved-addresses.ts.
  //  3. `idx_payment_methods_user`, and it is NOT unique: production has no
  //     unique constraint on `(user_id)`. Index-only, for the same reason as 2 —
  //     the table, its columns and its two CHECK constraints all come from the
  //     mirror, the CHECKs through the table-level `.check()` in
  //     src/database/schema/payment-methods.ts.
  //
  //     Production DOES have `idx_payment_methods_one_default` — the partial
  //     unique index `20260928040349_payment_methods_one_default` added — and it
  //     is deliberately NOT installed here, for the same reason
  //     `20260927141632_saved_addresses_one_default`'s index is not installed
  //     either: a spec that wants to observe the API's own clear-then-set
  //     transaction has to be able to produce the state the transaction exists to
  //     prevent. With the index present, every "two defaults are writable"
  //     assertion becomes a 23505 and the transaction is never exercised. The
  //     specs that assert it say explicitly that they are pinning the HARNESS and
  //     not production.
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
  // These indexes are NOT wrapped in `if not exists` for the sake of symmetry
  // with anything: an index declared in both the schema and here is a 42P07
  // waiting for the next run, and `if not exists` would downgrade it to a
  // NOTICE nobody reads. If one of these ever moves into the schema, delete it
  // from this file in the same change — that is the whole point of the note
  // above.
  await client.unsafe(`
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

    create index if not exists idx_saved_addresses_user
      on public.saved_addresses (user_id);
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

    -- The branch derivation. Statement for statement this is the body
    -- 20261013230029_orders_business_location.sql creates; only the header is
    -- reflowed, to the local style every install in this block uses, and the
    -- dollar-quote tag with it.
    --
    -- No backticks anywhere in this comment: the whole install list is ONE JS
    -- template literal and this comment sits inside it, so a backtick here
    -- closes the string and the harness fails to parse.
    --
    -- This is the one hand-installed trigger that is not a missing BEHAVIOUR but
    -- a missing DERIVATION, and the failure it causes is the mirror's worst
    -- shape: the mirror DECLARES orders.business_location_id as NOT NULL
    -- because Drizzle read that constraint off the live database, and nothing in
    -- the mirror FILLS it, because Drizzle cannot express a trigger. So every
    -- fixture that seeds an order without naming the column -- which is most of
    -- them, and correctly so, because no application is supposed to name it --
    -- died with
    --
    --     23502 null value in column "business_location_id" of relation "orders"
    --     violates not-null constraint
    --
    -- in me.user-order-stats, business-owner-stats and revenue-stats.repository.
    -- A harness that was merely missing a trigger fails loudly; this one failed
    -- with an error that names the column and points at the schema instead of at
    -- the harness.
    --
    -- Installed here for the same reason record_order_event sits two statements
    -- above: the mirror carries the shape and not the behaviour, and the
    -- behaviour is what the fixtures exist to exercise.
    --
    -- Copied rather than paraphrased so that a change to the migration shows up
    -- as a diff against this block instead of as a rewrite of it. The raise
    -- travels with it because the raise is part of the contract: an order whose
    -- offer does not exist must not land with a NULL branch.
    create or replace function public.set_order_business_location()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $location_fn$
    begin
      select f.business_location_id into new.business_location_id
      from public.offers f where f.id = new.offer_id;
      if new.business_location_id is null then
        raise exception 'la oferta % no existe, no se puede derivar la sucursal', new.offer_id;
      end if;
      return new;
    end;
    $location_fn$;

    create trigger trg_set_order_business_location
      before insert on public.orders
      for each row
      execute function public.set_order_business_location();

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

  // The two owner guards, verbatim from the ledger. Installed for the same
  // reason as the block above and with the same warning about copying: the
  // mirror carries `business_members.user_id ... ON DELETE CASCADE` (Drizzle read
  // that clause off the live database, so it is IN the generated SQL) and carries
  // no trigger. Without them, `DELETE /auth/account` on a business owner would
  // delete the profile, the cascade would delete the membership row, and the spec
  // would be green — because the very guard that makes that path unsafe is the
  // guard the harness does not have.
  //
  // So this is not "the trigger would be nice to have here": the erase path
  // (`AuthAccountRepository` + `AuthService.deleteAccount`) is built AROUND these
  // two functions, and the specs that pin it cannot mean anything without them.
  // `auth.service.db.spec.ts` holds the positive control — a profile that owns a
  // business, erased straight through the repository, has to raise `R0002` — so a
  // harness that lost this block fails loudly instead of passing quietly.
  //
  // `trg_enforce_owner_is_untouchable` (BEFORE UPDATE) is installed too, and for
  // a second reason: `anonymise` writes `deleted_at` on the caller's own
  // memberships, and a spec can only prove that a row it archived without a raw
  // database error if the update guard is present.
  //
  // Y CON EL INVARIANTE DIFERIDO, que es la mitad que se movió de sitio:
  // `20261020163244_ownership_transfer.sql` sacó del guard de la fila las dos
  // reglas que dependen del ESTADO FINAL de la transacción —la degradación y la
  // baja del dueño— y las puso en un `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY
  // DEFERRED` que se evalúa al commit. Un espejo con el guard viejo y sin el
  // trigger diferido negaría la degradación en la SENTENCIA, que es justo lo
  // que producción ya no hace: las dos copias tienen que ser la misma, porque
  // una spec del espejo que afirme lo contrario que producción está probando
  // otra cosa.
  //
  // OJO con la diferencia que el espejo NO tiene: `default_business_inactive`
  // (un trigger `BEFORE INSERT` de Supabase) no está acá, así que un negocio
  // sembrado por `seedBusiness` queda ACTIVO. En producción nace inactivo y hay
  // que activarlo a mano. El espejo no puede tener las dos cosas, y esta tarea
  // no es la de arreglarlo.
  await client.unsafe(`
    create or replace function public.enforce_owner_is_untouchable()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $fn$
    begin
      if old.role <> 'owner'::public.business_member_role then
        return new;
      end if;

      if old.status is distinct from new.status
         and new.status = 'disabled'::public.business_member_status then
        raise exception 'el dueño del negocio no se puede desactivar: transferí la propiedad a otro acceso primero'
          using
            errcode = 'R0002',
            detail = format('business=%s member=%s', new.business_id, old.id),
            hint = 'ningún rol desactiva al dueño; la propiedad se transfiere, no se desactiva';
      end if;

      return new;
    end;
    $fn$;

    create trigger trg_enforce_owner_is_untouchable
      before update on public.business_members
      for each row execute function public.enforce_owner_is_untouchable();

    create or replace function public.business_live_owner_count(p_business_id uuid)
    returns integer
    language sql
    stable
    security definer
    set search_path = ''
    as $fn$
      select count(*)::int
        from public.business_members m
       where m.business_id = p_business_id
         and m.role = 'owner'::public.business_member_role
         and m.status = 'active'::public.business_member_status
         and m.deleted_at is null;
    $fn$;

    create or replace function public.enforce_business_keeps_an_owner()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $fn$
    declare
      v_ids         uuid[];
      v_business_id uuid;
      v_active      boolean;
      v_live        integer;
    begin
      v_ids := array[new.business_id];
      if old.business_id is distinct from new.business_id then
        v_ids := array_append(v_ids, old.business_id);
      end if;

      foreach v_business_id in array v_ids loop
        select b.is_active into v_active
          from public.businesses b
         where b.id = v_business_id;

        if not coalesce(v_active, false) then
          continue;
        end if;

        v_live := public.business_live_owner_count(v_business_id);

        if v_live <> 1 then
          raise exception 'un negocio activo no puede quedar sin dueño vivo'
            using
              errcode = 'R0002',
              detail = format('business=%s member=%s', v_business_id, new.id),
              hint = 'transferí la propiedad a otro acceso antes de dejar al negocio sin dueño; un negocio inactivo puede no tenerlo';
        end if;
      end loop;

      return new;
    end;
    $fn$;

    create constraint trigger trg_business_keeps_an_owner
      after update on public.business_members
      deferrable initially deferred
      for each row execute function public.enforce_business_keeps_an_owner();

    create or replace function public.enforce_owner_cannot_be_deleted()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $fn$
    begin
      if old.role <> 'owner'::public.business_member_role then
        return old;
      end if;

      if old.deleted_at is null then
        raise exception 'el dueño del negocio no se puede borrar; dá de baja la fila en vez de borrarla'
          using
            errcode = 'R0002',
            detail = format('business=%s member=%s', old.business_id, old.id),
            hint = 'el borrado es lógico: la fila queda para saber quién operó en el negocio';
      end if;

      if to_regclass('public.business_ownership') is not null then
        if exists (
          select 1
            from public.business_ownership o
           where o.business_id = old.business_id
             and o.owner_id = old.user_id
        ) then
          raise exception 'el dueño del negocio no se puede borrar mientras el negocio lo nombre como su dueño: liberá la propiedad primero'
            using
              errcode = 'R0002',
              detail = format('business=%s member=%s', old.business_id, old.id),
              hint = 'la liberación archiva la membresía y borra la fila de propiedad en la misma transacción';
        end if;
      end if;

      return old;
    end;
    $fn$;

    create trigger trg_enforce_owner_cannot_be_deleted
      before delete on public.business_members
      for each row execute function public.enforce_owner_cannot_be_deleted();

    create or replace function public.release_business_ownership(
      p_business_id uuid,
      p_actor_user_id uuid
    )
    returns jsonb
    language plpgsql
    volatile
    security definer
    set search_path = ''
    as $fn$
    declare
      v_member record;
      v_active boolean;
    begin
      select b.is_active into v_active
        from public.businesses b
       where b.id = p_business_id
         for update;

      if not found then
        raise exception 'el negocio no existe'
          using
            errcode = 'R0004',
            detail = format('business=%s', p_business_id),
            hint = 'no hay un negocio con ese identificador';
      end if;

      if coalesce(v_active, false) then
        raise exception 'un negocio activo no libera a su dueño: transferí la propiedad'
          using
            errcode = 'R0004',
            detail = format('business=%s', p_business_id),
            hint = 'la propiedad de un negocio activo se transfiere con POST /businesses/:businessId/ownership/transfer';
      end if;

      select m.id, m.user_id into v_member
        from public.business_members m
       where m.business_id = p_business_id
         and m.user_id = p_actor_user_id
         and m.role = 'owner'::public.business_member_role
         and m.status = 'active'::public.business_member_status
         and m.deleted_at is null
       limit 1;

      if not found then
        raise exception 'sólo el dueño vivo del negocio puede liberar la propiedad'
          using
            errcode = 'R0004',
            detail = format('business=%s actor=%s', p_business_id, p_actor_user_id),
            hint = 'la liberación la pide el dueño vivo del negocio';
      end if;

      update public.business_members
         set deleted_at = now(),
             updated_at = now()
       where id = v_member.id;

      update public.business_member_locations
         set deleted_at = now(),
             updated_at = now()
       where member_id = v_member.id
         and deleted_at is null;

      if to_regclass('public.business_ownership') is not null then
        delete from public.business_ownership
         where business_id = p_business_id;
      end if;

      return jsonb_build_object(
        'business_id', p_business_id,
        'released_member_id', v_member.id,
        'released_user_id', v_member.user_id
      );
    end;
    $fn$;

    create or replace function public.enforce_business_reactivation_needs_owner()
    returns trigger
    language plpgsql
    security definer
    set search_path = ''
    as $fn$
    begin
      if new.is_active and public.business_live_owner_count(new.id) < 1 then
        raise exception 'un negocio sin dueño no se reactiva: devolvé el dueño primero'
          using
            errcode = 'R0002',
            detail = format('business=%s', new.id),
            hint = 'reactivar exige un dueño vivo: la plataforma se lo devuelve con POST /businesses/:businessId/ownership/restore';
      end if;

      return new;
    end;
    $fn$;

    create trigger trg_business_reactivation_needs_owner
      before update of is_active on public.businesses
      for each row execute function public.enforce_business_reactivation_needs_owner();

    create or replace function public.assign_business_ownership(
      p_business_id uuid,
      p_member_id uuid
    )
    returns jsonb
    language plpgsql
    volatile
    security definer
    set search_path = ''
    as $fn$
    declare
      v_business_id uuid;
      v_member      record;
    begin
      select b.id into v_business_id
        from public.businesses b
       where b.id = p_business_id
         for update;

      if not found then
        raise exception 'el negocio no existe'
          using
            errcode = 'R0004',
            detail = format('business=%s', p_business_id),
            hint = 'no hay un negocio con ese identificador';
      end if;

      if public.business_live_owner_count(p_business_id) > 0 then
        raise exception 'este negocio ya tiene un dueño: usá la transferencia'
          using
            errcode = 'R0004',
            detail = format('business=%s member=%s', p_business_id, p_member_id),
            hint = 'para cambiar de dueño está la transferencia: POST /businesses/:businessId/ownership/transfer';
      end if;

      select m.id, m.user_id into v_member
        from public.business_members m
       where m.id = p_member_id
         and m.business_id = p_business_id
         and m.status = 'active'::public.business_member_status
         and m.deleted_at is null
       limit 1;

      if not found then
        raise exception 'el miembro tiene que ser un acceso vivo de este negocio'
          using
            errcode = 'R0004',
            detail = format('business=%s member=%s', p_business_id, p_member_id),
            hint = 'un acceso dado de baja, pausado o de otro negocio no puede recibir la propiedad';
      end if;

      update public.business_members
         set role = 'owner'::public.business_member_role,
             updated_at = now()
       where id = v_member.id;

      if to_regclass('public.business_ownership') is not null then
        insert into public.business_ownership (business_id, owner_id)
        values (p_business_id, v_member.user_id)
        on conflict (business_id)
        do update set owner_id = excluded.owner_id, updated_at = now();
      end if;

      return jsonb_build_object(
        'business_id', p_business_id,
        'owner_member_id', v_member.id,
        'owner_user_id', v_member.user_id
      );
    end;
    $fn$;
  `);

  // The ONE account of the session expiry, copied VERBATIM from the ledger
  // (`20261015024825_business_policy_tightening.sql`).
  //
  // Why it is here: `apps/api/src/database/business-membership.ts` —the shared
  // answer to «is this my business?»— calls this function instead of computing
  // `last_authenticated_at + ttl` in TypeScript. That is deliberate: the ADR
  // says the arithmetic exists in exactly one place, and a copy in a `.ts` file
  // is invisible to the catalog guard that reads `pg_proc.prosrc`. So the API
  // asks the database, and the harness has to have the function the API asks.
  //
  // It is `IMMUTABLE` and takes its two arguments explicitly —no `auth.uid()`,
  // no session— so it installs here unchanged and it means the same thing in
  // the harness as in production. Copied rather than paraphrased so that a
  // change to the migration shows up as a diff against this block instead of as
  // a rewrite of it.
  await client.unsafe(`
    create or replace function public.business_member_session_expires_at(
      p_session_ttl_hours integer,
      p_last_authenticated_at timestamptz
    )
    returns timestamptz
    language sql
    immutable
    set search_path = ''
    as $$
      select case
        when p_session_ttl_hours > 0 and p_last_authenticated_at is not null
          then p_last_authenticated_at + (p_session_ttl_hours * interval '1 hour')
        else null
      end;
    $$;
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
