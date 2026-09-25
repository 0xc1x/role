-- Add verification_status to businesses (keep is_active as soft-delete)
alter table public.businesses add column if not exists verification_status text not null default 'pending'
  check (verification_status in ('pending','approved','rejected'));
alter table public.businesses add column if not exists verified_at timestamptz;
alter table public.businesses add column if not exists verified_by uuid references public.profiles(id);
alter table public.businesses add column if not exists rejection_reason text;

create index if not exists idx_businesses_verification on public.businesses(verification_status);

-- Backfill existing rows: active => approved, inactive => pending
update public.businesses set verification_status = 'approved' where is_active = true and verification_status = 'pending';
update public.businesses set verification_status = 'pending' where is_active = false;

-- Trigger to keep is_active in sync with verification_status (pending/rejected => is_active false)
create or replace function public.sync_business_verification()
returns trigger
language plpgsql
as $$
begin
  if NEW.verification_status = 'approved' then
    NEW.is_active := true;
    if OLD.verification_status is distinct from 'approved' then
      NEW.verified_at := now();
    end if;
  elsif NEW.verification_status in ('pending','rejected') then
    NEW.is_active := false;
    if NEW.verification_status = 'rejected' and OLD.verification_status is distinct from 'rejected' then
      NEW.verified_at := now();
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_sync_business_verification on public.businesses;
create trigger trg_sync_business_verification
  before insert or update of verification_status on public.businesses
  for each row execute function public.sync_business_verification();

-- RPC for platform stats already exists from previous pilot, ensure it counts approved only for businesses
create or replace function public.get_platform_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  users_count int;
  businesses_count int;
  meals_count int;
begin
  select count(*) into users_count from auth.users;
  select count(*) into businesses_count from public.businesses where verification_status = 'approved' and is_active = true;
  select count(*) into meals_count from public.orders where status in ('completed','picked_up');
  return jsonb_build_object('users', users_count, 'businesses', businesses_count, 'meals', meals_count);
end;
$$;
grant execute on function public.get_platform_stats() to anon, authenticated;