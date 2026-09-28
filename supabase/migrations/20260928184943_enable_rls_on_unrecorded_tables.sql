-- ─────────────────────────────────────────────────────────────────────────────
-- Enable RLS on the five tables that have it in production and no ledger row
-- ─────────────────────────────────────────────────────────────────────────────
--
-- app_store            0 policies, anon SELECT, authenticated SELECT
-- business_finance     0 policies, no privilege to either client role
-- business_moderation  0 policies, no privilege to either client role
-- offer_categories     4 policies, from 20260731041710_add_categories_rls.sql
-- slides               2 policies, from 20260821213534_harden_functions_and_slides_rls.sql
--
-- ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
--
-- Five tables have RLS enabled in production and no migration in this directory
-- enables it. The gap is in the LEDGER, not in the database: every one of the
-- five is already protected where it runs, and a fresh environment built by
-- replaying this directory would build them WITHOUT it.
--
-- The five are precisely the tables that were created without an ALTER of their
-- own, and 20260925225227_businesses_companion_tables.sql is the proof: it
-- creates business_ownership, business_finance and business_moderation, and
-- issues ONE enable — for business_ownership. The two holding balances and
-- verification state were left out of the same statement. The same shape appears
-- in 20260731002818 (offer_categories) and 20260728004359 (slides), and
-- 20260830014750 (app_store).
--
-- There is no collateral mechanism here, and it is worth saying so because the
-- obvious guess is wrong: REVOKE and GRANT manipulate privileges and cannot set
-- relrowsecurity. The 34 tables that ARE recorded are recorded one ALTER each,
-- and diffing that set against relrowsecurity in a replay comes out empty. The
-- five are simply the five that nobody wrote the line for.
--
-- ─── NOT rls_auto_enable(), and this is the part worth reading ───────────────
--
-- `public.rls_auto_enable()` exists in production. It is a plpgsql
-- SECURITY DEFINER event trigger function that would enable RLS on every table
-- created in public. It is attached to NOTHING: `select count(*) from
-- pg_event_trigger` returns zero rows.
--
-- So production's 39-of-39 RLS coverage comes entirely from explicit ALTER
-- statements, and this function covers nothing. That distinction matters because
-- the name is exactly what a reader would trust to have closed a gap like this
-- one, forever. It has not. A test pins it, because "there is a function called
-- rls_auto_enable" and "RLS is enabled on everything" look identical until you
-- check pg_event_trigger.
--
-- ─── No-op on production data ────────────────────────────────────────────────
--
-- All five already have RLS enabled there, and RLS changes no rows. This file
-- contains no INSERT, UPDATE or DELETE, so applying it changes the ledger and
-- nothing else. The revoke below is likewise a no-op in production, where
-- 20260928181714 already covered all 39 tables.
--
-- ─── The revoke, and why this file needs one ────────────────────────────────
--
-- 20260928181714_revoke_client_destructive_privileges.sql iterates pg_class
-- filtered on relrowsecurity. In production that was 39 of 39. In the harness
-- it was 34, because these five arrived without RLS and were therefore not in
-- the set — so in the harness they still hold TRUNCATE, TRIGGER and REFERENCES,
-- privileges RLS cannot govern. Measured: 18 residue rows across the three
-- tables that have no policies, zero after this revoke.
--
-- In production that half is a no-op. It exists because without it the harness
-- would be asserting 39/39 on a database where the destructive privileges are
-- only revoked on 34, which is the same class of confident wrong the previous
-- file closed.
--
-- ─── The deny-all on three of them, and the asymmetry ───────────────────────
--
-- app_store, business_finance and business_moderation have RLS enabled and ZERO
-- policies, so RLS denies every row to every non-owner role. That is deliberate
-- and it is a real defence — but it is not the same depth as the rest:
--
--   business_finance, business_moderation   deny-all RLS AND no privilege at all
--   app_store                               deny-all RLS only; BOTH client roles
--                                           hold SELECT
--
-- One GRANT, or one permissive policy added to app_store for convenience, makes
-- it readable. The two companions are closed twice. The asymmetry is pinned in
-- apps/api/src/database/security/enable-rls.rls.db.spec.ts so that nobody reads
-- this file and assumes the three are equally defended.
--
-- ─── Rollback ───────────────────────────────────────────────────────────────
--
-- Dropping RLS from these five returns them to the state a fresh replay of this
-- directory produces, which is the state this file exists to end. In production
-- that would remove protection that has been there since before this directory
-- recorded it, so a rollback is a security regression and not a neutral undo.

alter table if exists public.app_store enable row level security;
alter table if exists public.business_finance enable row level security;
alter table if exists public.business_moderation enable row level security;
alter table if exists public.offer_categories enable row level security;
alter table if exists public.slides enable row level security;
revoke truncate, trigger, references on table
  public.app_store,
  public.business_finance,
  public.business_moderation,
  public.offer_categories,
  public.slides
from anon, authenticated;
