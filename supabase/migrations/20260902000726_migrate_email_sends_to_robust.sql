-- Add new columns
alter table public.email_sends add column if not exists type email_send_type not null default 'campaign';
alter table public.email_sends add column if not exists source_type text;
alter table public.email_sends add column if not exists source_id uuid;
alter table public.email_sends add column if not exists attempts integer not null default 0;
alter table public.email_sends add column if not exists max_attempts integer not null default 5;
alter table public.email_sends add column if not exists error_code text;
alter table public.email_sends add column if not exists scheduled_at timestamptz;
alter table public.email_sends add column if not exists queued_at timestamptz;
alter table public.email_sends add column if not exists processed_at timestamptz;

-- Backfill type/source from campaign_id where exists (before dropping campaign_id)
-- Note: campaign_id still exists at this point from previous state (we haven't dropped yet, but after previous migration campaign_id is still there? Actually previous migration made campaign_id nullable but not dropped. Now we need to handle both cases: if campaign_id exists, use it)
do $$ begin
  if exists (select 1 from information_schema.columns where table_name='email_sends' and column_name='campaign_id') then
    execute 'update public.email_sends set type = ''campaign'', source_type = ''campaign'', source_id = campaign_id, scheduled_at = coalesce(scheduled_at, created_at), queued_at = coalesce(queued_at, created_at) where campaign_id is not null';
    execute 'update public.email_sends set type = ''transactional'', source_type = coalesce(source_type, ''contact''), scheduled_at = coalesce(scheduled_at, created_at), queued_at = coalesce(queued_at, created_at) where campaign_id is null';
  end if;
end $$;

-- Drop old campaign_id column and its FK/indexes
alter table public.email_sends drop constraint if exists email_sends_campaign_id_fkey;
drop index if exists idx_email_sends_campaign;
drop index if exists idx_email_sends_queued;
alter table public.email_sends drop column if exists campaign_id;

-- New indexes for robust queue (BD fuente de verdad, BullMQ solo ejecuta)
create index if not exists idx_email_sends_type_status on public.email_sends(type, status);
create index if not exists idx_email_sends_source on public.email_sends(source_type, source_id);
create index if not exists idx_email_sends_scheduled on public.email_sends(scheduled_at) where status in ('pending','queued');
create index if not exists idx_email_sends_queued_at on public.email_sends(queued_at);