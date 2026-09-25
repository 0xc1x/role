create table if not exists public.business_notification_preferences (
  business_id uuid primary key references public.businesses(id),
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  new_orders_enabled boolean not null default true,
  pickup_ready_enabled boolean not null default true,
  reviews_enabled boolean not null default true,
  low_stock_enabled boolean not null default false,
  daily_summary_enabled boolean not null default true,
  quiet_hours_from time null,
  quiet_hours_to time null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.create_business_notification_preferences()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.business_notification_preferences (business_id)
  values (new.id)
  on conflict (business_id) do nothing;
  return new;
end;
$function$;

drop trigger if exists trg_create_business_notification_preferences on public.businesses;
create trigger trg_create_business_notification_preferences
  after insert on public.businesses
  for each row
  execute function public.create_business_notification_preferences();

alter table public.business_notification_preferences enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Business owners view own notification preferences' and tablename = 'business_notification_preferences') then
    create policy "Business owners view own notification preferences"
      on public.business_notification_preferences for select
      using (business_id in (select id from public.businesses where owner_id = auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Business owners insert own notification preferences' and tablename = 'business_notification_preferences') then
    create policy "Business owners insert own notification preferences"
      on public.business_notification_preferences for insert
      with check (business_id in (select id from public.businesses where owner_id = auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Business owners update own notification preferences' and tablename = 'business_notification_preferences') then
    create policy "Business owners update own notification preferences"
      on public.business_notification_preferences for update
      using (business_id in (select id from public.businesses where owner_id = auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Service role full access' and tablename = 'business_notification_preferences') then
    create policy "Service role full access"
      on public.business_notification_preferences for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

create index if not exists idx_business_notif_prefs_business on public.business_notification_preferences (business_id);