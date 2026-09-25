create table if not exists public.consumer_notification_preferences (
  user_id uuid primary key references public.profiles(id),
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  favorite_alerts_enabled boolean not null default true,
  pickup_reminders_enabled boolean not null default true,
  last_minute_deals_enabled boolean not null default false,
  weekly_summary_enabled boolean not null default true,
  quiet_hours_from time null,
  quiet_hours_to time null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.consumer_notification_preferences (user_id, push_enabled, email_enabled)
select user_id, push_notifications_enabled, email_notifications_enabled
from public.user_preferences
on conflict (user_id) do nothing;

alter table public.user_preferences drop column if exists push_notifications_enabled;
alter table public.user_preferences drop column if exists email_notifications_enabled;

create or replace function public.create_user_preferences()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.consumer_notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

alter table public.consumer_notification_preferences enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'Users can view own notification preferences' and tablename = 'consumer_notification_preferences') then
    create policy "Users can view own notification preferences"
      on public.consumer_notification_preferences for select
      using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Users can insert own notification preferences' and tablename = 'consumer_notification_preferences') then
    create policy "Users can insert own notification preferences"
      on public.consumer_notification_preferences for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Users can update own notification preferences' and tablename = 'consumer_notification_preferences') then
    create policy "Users can update own notification preferences"
      on public.consumer_notification_preferences for update
      using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where policyname = 'Service role full access' and tablename = 'consumer_notification_preferences') then
    create policy "Service role full access"
      on public.consumer_notification_preferences for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

create index if not exists idx_consumer_notif_prefs_user on public.consumer_notification_preferences (user_id);