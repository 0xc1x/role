-- Permitir emails transaccionales sin campaña (business verification, contact fallback)
alter table public.email_sends alter column campaign_id drop not null;
alter table public.email_sends drop constraint if exists email_sends_campaign_id_fkey;
alter table public.email_sends add constraint email_sends_campaign_id_fkey foreign key (campaign_id) references public.campaigns(id) on delete cascade;
-- Asegurar que al menos email esté presente
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'email_sends_check_email_or_campaign') then
    alter table public.email_sends add constraint email_sends_check_email_or_campaign check (campaign_id is not null or email is not null);
  end if;
end $$;