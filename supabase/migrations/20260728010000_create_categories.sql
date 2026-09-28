-- Backfilled gap: public.categories — a table production has and this directory
-- never described.
--
-- RECONSTRUCTION, 2026-09-28. NOT APPLIED TO PRODUCTION. NOT BYTE-IDENTICAL TO
-- ANY LEDGER ROW (there is no ledger row; that is the whole problem).
--
-- WHAT THIS CLOSES
--
-- `supabase_migrations.schema_migrations` has no row for the creation of
-- `public.categories`. The table exists in production. Replaying this directory
-- produces a database without it, and four migrations downstream abort:
--
--   20260731002818_add_offer_categories.sql
--     `INSERT INTO categories ...` as its very first statement, then
--     `CREATE TABLE offer_categories (... category_id uuid REFERENCES
--     categories(id) ON DELETE CASCADE)`. A foreign key to a relation that was
--     never created. This is the failure that makes the directory unreplayable
--     at 20260731, and it is why this file is versioned *before* it.
--   20260731041710_add_categories_rls.sql
--     `relation "public.categories" does not exist`
--   20260904210516 / 20260905235431 / 20260928041322
--     the offer-feed RPCs join offer_categories -> categories inside a
--     plpgsql body, so the failure surfaces as a function-body validation error
--     rather than a missing-relation error.
--
-- The table was evidently created in the dashboard or through a write path that
-- left no ledger row, so there is no version to recover and no text to copy.
-- What follows is the CURRENT production definition, read back from
-- information_schema, pg_indexes and pg_constraint. The shape is confirmed by
-- three independent pieces of evidence:
--
--   * `categories_slug_key` is a UNIQUE btree index on (slug), which is the
--     implicit index behind an inline `slug text not null unique`. The UNIQUE
--     therefore belongs in the column definition and there is deliberately NO
--     separate `create index` for it — adding one would produce a second
--     redundant index that production does not have.
--   * `categories_pkey` is the btree on (id) implied by `id uuid primary key`.
--   * The column list, nullability, defaults and the two `timestamp` (not
--     `timestamptz`) columns for updated_at/deleted_at are transcribed as found.
--     The mixed timestamp types are ugly and they are preserved on purpose:
--     `updated_at timestamp` and `deleted_at timestamp` are what production has,
--     and a `timestamptz` "fix" here would be a behavioural change smuggled
--     into a file whose only job is to describe what already exists.
--
-- WHAT IS DELIBERATELY NOT HERE
--
--   * RLS policies. They are already in 20260731041710_add_categories_rls.sql
--     and match production. Duplicating them would create a second, divergent
--     source of truth for the same rules.
--   * Table grants. anon, authenticated, service_role and postgres hold
--     SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on this table in
--     production. That is Supabase's `alter default privileges` for a newly
--     created table, not a decision anyone wrote down, so there is nothing to
--     reproduce — a fresh CREATE TABLE on any Supabase project gets them
--     automatically.
--     Whether they *should* be there is a separate, open finding: an admin-only
--     catalog table handing INSERT/UPDATE/DELETE to `anon` is a wider surface
--     than the policies imply, since RLS restricts rows but the grants are what
--     put anon in the game at all. It is recorded and handled separately, on
--     purpose, because tightening grants is a production change and this file
--     is a reconstruction. Reproduce-then-harden, never harden-while-rebuilding.
--   * Row data. No migration in this directory ever created category rows; the
--     catalog content arrives through 20260731002818 and 20260731041710. Nothing
--     to restore here.
--
-- WHY THIS FILE MUST NOT BE APPLIED TO PRODUCTION
--
-- The table is already there. Beyond being pointless, the *version* is the real
-- hazard: `20260728010000` is synthetic — a slot picked so that
--
--     20260728004359_create_slides_table.sql
--     20260728010000_create_categories.sql   <-- this file
--     20260731002818_add_offer_categories.sql
--
-- sorts categories into existence before the first migration that references
-- it. The Supabase server assigns versions; this one was assigned by hand. If
-- `supabase db push` ever ran against production with this file in the
-- directory, the ledger would acquire a version the server never issued and the
-- directory would claim to describe history that did not happen in that form.
-- The statements are idempotent (`create table if not exists`, `enable row
-- level security`) so the DDL itself is harmless, but the ledger entry would not
-- be. The rule this directory exists to enforce — every DDL change enters via
-- `apply_migration` and is proven with `md5sum` — cannot be satisfied by a file
-- with no ledger row to match against, which is exactly why this one is labelled
-- a backfill rather than treated as a normal migration.
--
-- ROLLBACK: `drop table if exists public.categories;` — but only on an
-- environment where nothing references it. offer_categories has an FK to it, so
-- on production this is not a rollback, it is data loss.
--
-- VERIFYING: there is no `md5sum` to run here, and that absence is the defect
-- being documented. A read-back comparison against production is the only
-- available check:
--
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'categories'
--    order by ordinal_position;

begin;

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  emoji       text,
  slug        text not null unique,
  image_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamp,
  deleted_at  timestamp
);

-- RLS enabled, FORCE not enabled: relrowsecurity = true, relforcerowsecurity =
-- false in production, which is the state below. With no policy defined yet the
-- table is unreachable through the API, which is the safe intermediate state —
-- 20260731041710 opens it deliberately, one migration later, and this file
-- should not pretend otherwise by attaching the policies here.
alter table public.categories enable row level security;

commit;
