-- Phase 1 of the businesses column split: additive only.
--
-- WHY
--
-- public.businesses is read through PostgREST by the offers catalog, and
-- PostgREST needs table-level SELECT on a referenced table to resolve
-- relationships. That forced a temporary reversal of finding P1-2: seven
-- columns are readable by anon until this split lands.
--
--   owner_id, balance, commission_rate,
--   verification_status, verified_at, verified_by, rejection_reason
--
-- The fix is to stop keeping them on the table that anon must be able to read.
-- Each becomes a one-row-per-business companion table, so table-level SELECT on
-- businesses becomes safe again.
--
-- This phase creates and backfills the companions and changes nothing else.
-- The columns stay in place, every existing query and policy keeps working, and
-- the app is unaffected. The app refactor and the DROP happen in later phases,
-- so nothing breaks at any point in between.
--
-- WHY owner_id IS ON THE LIST
--
-- RLS on businesses uses it in three policies, so it looks like it could stay.
-- It cannot: anon reads the catalog, so anon gets table-level SELECT, which
-- exposes whatever is on the table. Leaving owner_id behind would also publish
-- which account owns each business. The ownership policies move to a subquery in
-- phase 3; the supporting index is created here.
--
-- GRANTS IN THIS PHASE
--
-- service_role only. Nothing reads the companions yet, and locking them down
-- from the start means an accidental public read fails loudly in phase 2 rather
-- than quietly. RLS is enabled on business_ownership because the phase-3
-- policies will query it as the calling role.
--
-- ROLLBACK: drop the three tables. The columns on businesses are untouched, so
-- this phase can be reverted with no data loss and no app impact.

begin;

create table if not exists public.business_ownership (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.business_ownership is
  'Business ownership, split out of public.businesses so anon can hold table-level SELECT on businesses for PostgREST relationship resolution without seeing who owns each business. Read by the owner RLS policies and by the API; never exposed to anon.';

create index if not exists idx_business_ownership_owner_id
  on public.business_ownership (owner_id);

create table if not exists public.business_finance (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  balance numeric(12, 2) not null default 0.00,
  commission_rate numeric(10, 4) not null default 0.1000,
  updated_at timestamptz not null default now()
);

comment on table public.business_finance is
  'Per-business money: balance and platform commission rate. Split out of public.businesses because these are commercially sensitive and must not be readable by anon. service_role only.';

create table if not exists public.business_moderation (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  verification_status text not null default 'pending',
  verified_at timestamptz,
  verified_by uuid references public.profiles (id),
  rejection_reason text,
  updated_at timestamptz not null default now()
);

comment on table public.business_moderation is
  'Platform moderation state for a business. Split out of public.businesses because it is internal. service_role only.';

-- Backfill. Idempotent, and the defaults above match the columns being moved so
-- a row that already exists is left alone on a re-run.
insert into public.business_ownership (business_id, owner_id, created_at, updated_at)
select id, owner_id, created_at, updated_at
from public.businesses
on conflict (business_id) do nothing;

insert into public.business_finance (business_id, balance, commission_rate, updated_at)
select id, coalesce(balance, 0.00), coalesce(commission_rate, 0.1000), updated_at
from public.businesses
on conflict (business_id) do nothing;

insert into public.business_moderation (
  business_id, verification_status, verified_at, verified_by, rejection_reason, updated_at
)
select
  id,
  verification_status,
  verified_at,
  verified_by,
  rejection_reason,
  updated_at
from public.businesses
on conflict (business_id) do nothing;

-- RLS on the ownership companion: the owner sees their own row, an admin sees
-- all. The phase-3 policies on businesses will call into this, so it needs RLS
-- of its own rather than relying on the parent's.
alter table public.business_ownership enable row level security;

create policy "Owners can view own business ownership"
  on public.business_ownership
  for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "Admins can view all business ownership"
  on public.business_ownership
  for select
  to authenticated
  using ((select auth_helpers.my_role()) = 'admin'::app_role);

-- service_role only for now. Widening happens with the app refactor.
revoke all on public.business_ownership from anon, authenticated;
revoke all on public.business_finance from anon, authenticated;
revoke all on public.business_moderation from anon, authenticated;
grant all on public.business_ownership to service_role;
grant all on public.business_finance to service_role;
grant all on public.business_moderation to service_role;

commit;
