-- Triggers para notificar por email cuando un negocio se registra (pending) y cuando se aprueba/rechaza
create or replace function public.notify_business_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_template_id uuid;
  owner_template_id uuid;
  admin_email text;
  owner_email text;
begin
  if NEW.verification_status != 'pending' then
    return NEW;
  end if;
  -- solo en INSERT con pending
  if TG_OP = 'INSERT' then
    select id into admin_template_id from email_templates where name = 'business-pending-admin' and is_active and deleted_at is null limit 1;
    select id into owner_template_id from email_templates where name = 'business-pending-owner' and is_active and deleted_at is null limit 1;
    -- resolver emails
    select value #>> '{}' into admin_email from app_config where key = 'contact.negocios_email' and active and is_public;
    if admin_email is null or admin_email !~ '@' then admin_email := 'negocios@role.app'; end if;
    owner_email := coalesce(NEW.email, (select email from auth.users where id = NEW.owner_id));

    if admin_template_id is not null then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.id, admin_template_id, admin_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', NEW.name, 'businessType', NEW.type, 'ownerEmail', owner_email, 'phone', coalesce(NEW.phone,''), 'description', coalesce(NEW.description,''), 'adminUrl', 'https://admin.role.app/businesses/' || NEW.id::text));
    end if;
    if owner_template_id is not null and owner_email ~ '@' then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.id, owner_template_id, owner_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', NEW.name));
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_business_pending on public.businesses;
create trigger trg_notify_business_pending after insert on public.businesses for each row execute function public.notify_business_pending();

create or replace function public.notify_business_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tmpl_id uuid;
  owner_email text;
begin
  if OLD.verification_status = NEW.verification_status then
    return NEW;
  end if;
  if NEW.verification_status = 'approved' then
    select id into tmpl_id from email_templates where name = 'business-approved' and is_active and deleted_at is null limit 1;
    owner_email := coalesce(NEW.email, (select email from auth.users where id = NEW.owner_id));
    if tmpl_id is not null and owner_email ~ '@' then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.id, tmpl_id, owner_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', NEW.name, 'appUrl', 'role://'));
    end if;
  elsif NEW.verification_status = 'rejected' then
    select id into tmpl_id from email_templates where name = 'business-rejected' and is_active and deleted_at is null limit 1;
    owner_email := coalesce(NEW.email, (select email from auth.users where id = NEW.owner_id));
    if tmpl_id is not null and owner_email ~ '@' then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.id, tmpl_id, owner_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', NEW.name, 'rejectionReason', coalesce(NEW.rejection_reason,'No especificado')));
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_business_verification on public.businesses;
create trigger trg_notify_business_verification after update of verification_status on public.businesses for each row execute function public.notify_business_verification();