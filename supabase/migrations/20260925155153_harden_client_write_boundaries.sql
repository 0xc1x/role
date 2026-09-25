-- P0 authorization hardening for direct Supabase clients.
--
-- SAFETY: this migration MUST be applied first to a reviewed Supabase development
-- branch. Do not apply it directly to production. Validate the role matrix and
-- the reserve_offer/cancel_order/set_order_status RPCs in the branch before
-- promoting it.
--
-- Rollback note: do not blindly restore the previous broad grants and policies.
-- That reopens profile-role escalation, platform-field mutation, arbitrary
-- profile reads, and direct order writes. A rollback must be a separately
-- reviewed security migration with an explicit replacement authorization model.

begin;

-- Public signup may request only a customer or business profile. The trigger is
-- idempotent, uses a fixed search_path, and preserves the existing identity
-- metadata behavior.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    phone,
    role
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url',
    new.phone,
    (
      case
        when new.raw_user_meta_data ->> 'role' in ('user', 'business')
          then new.raw_user_meta_data ->> 'role'
        else 'user'
      end
    )::public.app_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Client-owned businesses start pending and inactive. Service-role writes used
-- by the API onboarding/admin flows may still set platform fields explicitly.
alter table public.businesses
  alter column is_active set default false;

alter table public.businesses
  alter column verification_status set default 'pending';

-- Remove inherited/default table and column write privileges. Column grants are
-- revoked explicitly because a table-level REVOKE does not remove column ACLs.
revoke all privileges on table public.profiles from anon, authenticated;
revoke all privileges on table public.businesses from anon, authenticated;
revoke all privileges on table public.orders from anon, authenticated;

do $$
declare
  target record;
begin
  for target in
    select
      c.relname as table_name,
      a.attname as column_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where n.nspname = 'public'
      and c.relname in ('profiles', 'businesses', 'orders')
      and a.attnum > 0
      and not a.attisdropped
  loop
    execute format(
      'revoke insert (%1$I) on table public.%2$I from anon, authenticated',
      target.column_name,
      target.table_name
    );
    execute format(
      'revoke update (%1$I) on table public.%2$I from anon, authenticated',
      target.column_name,
      target.table_name
    );
  end loop;
end;
$$;

-- Profiles: self-service reads remain, but only non-role profile fields are
-- writable. INSERT remains trigger/service-role only.
grant select on table public.profiles to authenticated;
grant update (full_name, email, avatar_url, phone, city)
  on table public.profiles
  to authenticated;

-- Businesses: authenticated owners may create and edit descriptive fields.
-- Platform state, ownership, money, ratings, timestamps, and verification data
-- require the API/service_role boundary.
grant select on table public.businesses to anon, authenticated;
grant insert (
  owner_id,
  name,
  type,
  slug,
  image,
  cover_image,
  description,
  phone,
  email,
  website
) on table public.businesses to authenticated;
grant update (
  name,
  type,
  slug,
  image,
  cover_image,
  description,
  phone,
  email,
  website
) on table public.businesses to authenticated;

drop policy if exists "Owners can insert own businesses" on public.businesses;
create policy "Owners can insert own businesses"
on public.businesses
for insert
to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "Owners can update own businesses" on public.businesses;
create policy "Owners can update own businesses"
on public.businesses
for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

-- Orders are read-only through PostgREST for client roles. All mutations use
-- explicit SECURITY DEFINER RPCs, which retain the service-role owner context.
grant select on table public.orders to authenticated;

drop policy if exists "Users can insert own orders" on public.orders;
drop policy if exists "Users can cancel own pending orders" on public.orders;
drop policy if exists "Business can update own orders" on public.orders;
drop policy if exists "Admins can update all orders" on public.orders;

-- Replace the broad business-role profile read with the minimum relationship
-- needed by business order/customer flows: profiles of users who have an order
-- for a business owned by the caller. Own-profile and admin policies remain.
drop policy if exists "Business can view business profiles" on public.profiles;
drop policy if exists "Businesses can view their order customers" on public.profiles;
create policy "Businesses can view their order customers"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    join public.businesses b on b.id = o.business_id
    where o.user_id = profiles.id
      and b.owner_id = (select auth.uid())
  )
);

-- Make the approved order mutation surface explicit. These signatures match
-- the current RPCs; revoking PUBLIC prevents future default-execute expansion.
revoke all on function public.reserve_offer(uuid, uuid, uuid) from public;
revoke all on function public.cancel_order(uuid, uuid, uuid) from public;
revoke all on function public.set_order_status(uuid, text) from public;
grant execute on function public.reserve_offer(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.cancel_order(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.set_order_status(uuid, text)
  to authenticated, service_role;

comment on function public.handle_new_user() is
  'Creates the public profile for a new Auth user. Metadata roles are allowlisted to user/business; duplicate trigger execution is a no-op.';

commit;
