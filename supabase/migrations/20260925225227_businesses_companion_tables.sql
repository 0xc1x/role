begin;

create table if not exists public.business_ownership (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_ownership_owner_id
  on public.business_ownership (owner_id);

create table if not exists public.business_finance (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  balance numeric(12, 2) not null default 0.00,
  commission_rate numeric(10, 4) not null default 0.1000,
  updated_at timestamptz not null default now()
);

create table if not exists public.business_moderation (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  verification_status text not null default 'pending',
  verified_at timestamptz,
  verified_by uuid references public.profiles (id),
  rejection_reason text,
  updated_at timestamptz not null default now()
);

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
select id, verification_status, verified_at, verified_by, rejection_reason, updated_at
from public.businesses
on conflict (business_id) do nothing;

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

revoke all on public.business_ownership from anon, authenticated;
revoke all on public.business_finance from anon, authenticated;
revoke all on public.business_moderation from anon, authenticated;
grant all on public.business_ownership to service_role;
grant all on public.business_finance to service_role;
grant all on public.business_moderation to service_role;

commit;
