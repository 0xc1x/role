-- Agregar template_id a email_sends para reintentos sin campaign_id
alter table public.email_sends add column if not exists template_id uuid references public.email_templates(id) on delete set null;

-- Backfill desde campaigns.template_id donde campaign_id no es null
update public.email_sends es
set template_id = c.template_id
from public.campaigns c
where es.campaign_id = c.id
  and es.template_id is null
  and c.template_id is not null;

-- Para filas huérfanas sin template (si las hay), asignar la primera plantilla activa como fallback para no bloquear not-null
do $$
declare
  fallback_id uuid;
begin
  select id into fallback_id from public.email_templates where is_active = true and deleted_at is null limit 1;
  if fallback_id is not null then
    update public.email_sends set template_id = fallback_id where template_id is null;
  end if;
end $$;

-- Ahora hacer not nullable (exigido para reintentos)
alter table public.email_sends alter column template_id set not null;

create index if not exists idx_email_sends_template on public.email_sends(template_id);