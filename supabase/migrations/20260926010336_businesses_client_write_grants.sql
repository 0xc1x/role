-- Restore the client write path on public.businesses.
--
-- Regression from 20260925163235, which ran
--   revoke all on table public.businesses from anon, authenticated
-- and never gave the write grants back. Only SELECT was restored
-- (20260925163235 also, and again by 20260925224820). Every owner action in the
-- mobile business panel has therefore failed with
--   42501 permission denied for table businesses
-- and, per PostgREST's HINT, `GRANT UPDATE ON public.businesses TO authenticated`.
--
-- The cause is Supabase's default privileges: the project grants
-- `anon=arwdDxtm,authenticated=arwdDxtm` on every new table in `public`, so
-- businesses was born fully writable and the revoke took that away silently.
-- Nothing in the ledger ever stated an intent to remove business self-service;
-- the offers table kept its grants because it was handled separately, and
-- businesses was simply not in that pass.
--
-- RLS was never the problem and is not touched here. The policies were correct
-- the whole time; the privileges underneath them were gone.

begin;

-- ── INSERT ──────────────────────────────────────────────────────────────────
--
-- Exactly the columns apps/mobile createBusiness writes. owner_id is included
-- only so the column can be satisfied when a privileged caller supplies it; the
-- trigger below fills it for a normal client, and the RLS policy still requires
-- it to equal auth.uid(), so a caller cannot claim someone else's business.
--
-- Not granted: owner_id transfer semantics (the policy and trigger own it),
-- is_active and the verification columns (moderation is not the owner's to
-- set), rating and review_count (derived), balance and commission_rate
-- (platform money), created_at and currency (server-owned).
grant insert (
  name,
  slug,
  type,
  phone,
  email,
  description,
  image,
  cover_image,
  website,
  owner_id
) on table public.businesses to authenticated;

-- ── UPDATE ──────────────────────────────────────────────────────────────────
--
-- Exactly the columns apps/mobile updateBusiness writes: updated_at always, the
-- rest conditionally. This is the call that was returning 42501.
grant update (
  updated_at,
  name,
  description,
  phone,
  email,
  website,
  type,
  image,
  cover_image
) on table public.businesses to authenticated;

-- ── Ownership is assigned, not expressed ────────────────────────────────────
--
-- Phase 2 removed owner_id from the mobile insert payload on purpose, but
-- businesses.owner_id is NOT NULL, so an INSERT without it fails 42502. The
-- client must not be pushed back into sending it.
--
-- A BEFORE INSERT trigger can fill it: unlike the companion bootstrap in
-- 20260926000011, this one writes no foreign-keyed row, so it does not need the
-- parent to exist yet. auth.uid() is the only source, so ownership stays
-- something the caller cannot express.
--
-- This trigger is removed by phase 3, which drops the column it writes. That
-- coupling is asserted by a test, because a trigger left behind after a DROP
-- fails on the next insert rather than at migration time.
create or replace function public.set_business_owner_from_jwt()
returns trigger
language plpgsql security definer
set search_path = ''
as $fn$
begin
  if new.owner_id is null and (select auth.uid()) is not null then
    new.owner_id := (select auth.uid());
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_set_business_owner_from_jwt on public.businesses;
create trigger trg_set_business_owner_from_jwt
  before insert on public.businesses
  for each row
  execute function public.set_business_owner_from_jwt();

-- A new business starts pending and inactive, which is what the moderation
-- flow expects. The old trigger chain did this on verification_status; stating
-- it here keeps the invariant independent of that trigger's location.
--
-- The value is not granted to the client, so this cannot be bypassed by a write
-- that omits is_active: the column keeps its default and the trigger confirms it.
create or replace function public.default_business_inactive()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.is_active is distinct from false then
    new.is_active := false;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_default_business_inactive on public.businesses;
create trigger trg_default_business_inactive
  before insert on public.businesses
  for each row
  execute function public.default_business_inactive();

comment on table public.businesses is
  'Public business profile plus owner self-service. Table-level SELECT for anon/authenticated is required by PostgREST relationship resolution. Client writes are limited by the INSERT/UPDATE column grants, by RLS, and by is_active being absent from both; owner_id is assigned from auth.uid() by trigger. Phase 3 moves owner_id, money and moderation state to companion tables and drops this table''s sensitive columns.';

commit;
