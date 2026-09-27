-- Normalise the product domain to role.ec, and stop hardcoding one in a trigger.
--
-- The domain was already migrated once, by 20260926021657, which moved eight
-- app_config values and three business templates off role.app and raises if any
-- template still references it. That migration only covered the values that
-- existed at the time, so three leaks survived it and are closed here:
--
--   privacy.contact_email        privacidad@role.app -> privacidad@role.ec
--   email_templates  "Novedades Role (mensual)"   href="https://role.app"
--   email_components "Footer principal (oscuro)"  href="https://role.app"
--
-- The privacy address is the one that matters: it is where a data subject
-- request is meant to arrive, and role.app is not a domain this project
-- receives mail on. The two template links point users at a host that is not
-- the product.
--
-- The social handles stay on role.app. facebook.com/role.app and
-- tiktok.com/@role.app are account names, not infrastructure, and rewriting
-- them would break every link in every footer. The closing assertion below
-- deliberately excludes the `social.` namespace for that reason.
--
-- WHY THE ADMIN URL IS TOUCHED AT ALL
--
-- notify_business_pending built `adminUrl` from a literal
-- 'https://admin.role.app/businesses/'. There is no app_config key for it, and
-- no evidence in the repository settles whether that host is correct: the only
-- other occurrences are CORS_ORIGINS values in two test fixtures, which are
-- arbitrary dummies. Rewriting that literal to .ec would be a guess dressed as
-- a fix. So the literal moves into `links.admin_url`, seeded with the value
-- that is in use today, and the trigger reads the key. The domain can then be
-- corrected from the admin panel in one edit instead of one edit to a migration
-- that already ran -- which is the whole failure mode that produced this file.
--
-- A missing or inactive key falls back to the previous literal, so removing the
-- configuration degrades to today's behaviour instead of sending an operator a
-- link with a null host.
--
-- Idempotent: re-running finds nothing left to replace and the closing
-- assertions still hold.

begin;

-- 1. Configuration

update public.app_config
   set value = to_jsonb('privacidad@role.ec'::text), updated_at = now()
 where key = 'privacy.contact_email'
   and value #>> '{}' = 'privacidad@role.app';

insert into public.app_config (key, value, value_type, category, label, description, is_public, active)
values ('links.admin_url', to_jsonb('https://admin.role.app'::text), 'string', 'links',
        'Admin panel URL',
        'Base URL of the admin panel, used to build the deep link in business-review emails. Configure it here rather than editing a migration.',
        false, true)
on conflict (key) do nothing;

-- 2. Template and component links
--
-- The literal is `https://role.app`, which cannot match a social handle: those
-- are `https://www.facebook.com/role.app` and friends, and only the host part
-- is rewritten.

update public.email_templates
   set body_html = replace(body_html, 'https://role.app', 'https://role.ec'),
       updated_at = now()
 where deleted_at is null
   and body_html like '%https://role.app%';

update public.email_components
   set html_content = replace(html_content, 'https://role.app', 'https://role.ec'),
       updated_at = now()
 where deleted_at is null
   and html_content like '%https://role.app%';

-- 3. The trigger reads the URL instead of embedding it
--
-- Rewritten in place from its own definition, each substitution asserted, so an
-- edit to the function since this migration was written fails the migration
-- instead of silently leaving a literal behind.

do $rewrite$
declare
  v_def text;
  v_dcl_old constant text := $q$  admin_email text;
  owner_email text;$q$;
  v_dcl_new constant text := $q$  admin_email text;
  v_admin_url text;
  owner_email text;$q$;
  v_url_old constant text := $q$    if admin_email is null or admin_email !~ '@' then admin_email := 'negocios@role.ec'; end if;$q$;
  v_url_new constant text := $q$    if admin_email is null or admin_email !~ '@' then admin_email := 'negocios@role.ec'; end if;
    -- The admin URL is configuration, not a literal. It used to be baked into
    -- this trigger body, which meant a domain change required editing a
    -- migration that had already run. Falls back to the previous literal so a
    -- missing key is never the reason an operator loses the deep link.
    select coalesce((select value #>> '{}' from public.app_config
                      where key = 'links.admin_url' and active),
                    'https://admin.role.app')
      into v_admin_url;$q$;
  v_use_old constant text := $q$'adminUrl', 'https://admin.role.app/businesses/' || NEW.id::text$q$;
  v_use_new constant text := $q$'adminUrl', v_admin_url || '/businesses/' || NEW.id::text$q$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'notify_business_pending';

  if v_def is null then
    raise exception 'notify_business_pending() not found';
  end if;

  if position(v_dcl_old in v_def) = 0
     or position(v_url_old in v_def) = 0
     or position(v_use_old in v_def) = 0 then
    raise exception 'notify_business_pending does not match the expected text';
  end if;

  v_def := replace(v_def, v_dcl_old, v_dcl_new);
  v_def := replace(v_def, v_url_old, v_url_new);
  v_def := replace(v_def, v_use_old, v_use_new);
  execute v_def;
end $rewrite$;

-- 4. Close the door behind it
--
-- Two namespaces are exempt, each for a stated reason.
--
-- `social.%` holds account names, not hosts. `facebook.com/role.app` and
-- `tiktok.com/@role.app` are the brand's handles on someone else's domain;
-- rewriting the string would break every link in every footer.
--
-- `links.admin_url` is exempt because its domain is the one open question in
-- this migration. It is seeded with the value the trigger was already using, so
-- this file changes no behaviour, and the operator confirms and corrects it in
-- one edit. Asserting it here would be asserting the guess. When it is
-- corrected, remove this exemption in the same migration that corrects it.

do $verify$
declare
  v_leftovers text;
begin
  select string_agg(key, ', ') into v_leftovers
  from public.app_config
  where key not like 'social.%'
    and key <> 'links.admin_url'
    and value::text ~* 'role.app';

  if v_leftovers is not null then
    raise exception 'non-social app_config still references role.app: %', v_leftovers;
  end if;

  if exists (select 1 from public.email_templates
             where deleted_at is null and body_html like '%https://role.app%') then
    raise exception 'an email template still links to https://role.app';
  end if;

  if exists (select 1 from public.email_components
             where deleted_at is null and html_content like '%https://role.app%') then
    raise exception 'an email component still links to https://role.app';
  end if;

  if not exists (select 1 from public.app_config where key = 'links.admin_url' and active) then
    raise exception 'links.admin_url missing or inactive';
  end if;
end $verify$;

commit;