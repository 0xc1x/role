-- Confirm the admin panel domain.
--
-- 20260927053728 moved notify_business_pending's hardcoded admin URL into
-- `links.admin_url` and deliberately exempted that key from its own closing
-- assertion, because the domain was the one open question in that migration:
-- nothing in the repository settled whether `admin.role.app` was right, and the
-- only other occurrences were CORS_ORIGINS values in two test fixtures, which
-- are arbitrary dummies. That migration instructed that the exemption be
-- removed in whatever migration corrected the value. This is that migration.
--
-- The panel is served from the `admin.` subdomain of the product domain, which
-- is `role.ec` — the same domain `store.ios_url` and `store.play_url` already
-- use. The subdomain was never in doubt; the TLD was.
--
-- The assertion no longer needs an exemption, so it does not have one: every
-- non-social key must now be free of the old domain. `social.%` stays exempt
-- because `facebook.com/role.app` and `tiktok.com/@role.app` are account
-- names on someone else's domain, not infrastructure.
--
-- NOT CHANGED HERE, because this migration cannot see it: `CORS_ORIGINS` in
-- production is set from the Render dashboard (`sync: false` in render.yaml)
-- and is not readable from the repository or from the database. If the panel
-- moves to admin.role.ec, that variable needs `https://admin.role.ec` in it or
-- every browser call from the panel is refused. `validateEnv` already forbids
-- `*` in production, so the list is explicit and this is a real omission until
-- the variable is updated there.
--
-- Idempotent.

begin;

update public.app_config
   set value = to_jsonb('https://admin.role.ec'::text), updated_at = now()
 where key = 'links.admin_url'
   and value #>> '{}' is distinct from 'https://admin.role.ec';

do $verify$
declare
  v_leftovers text;
begin
  -- `like`, not a regex: this file is transported as text and a lost
  -- backslash in a regex is a silent semantic change. A literal match has
  -- nothing to escape.
  select string_agg(key, ', ') into v_leftovers
  from public.app_config
  where key not like 'social.%'
    and value::text like '%role.app%';

  if v_leftovers is not null then
    raise exception 'non-social app_config still references role.app: %', v_leftovers;
  end if;

  if not exists (
    select 1 from public.app_config
    where key = 'links.admin_url'
      and value #>> '{}' = 'https://admin.role.ec'
      and active
  ) then
    raise exception 'links.admin_url was not set to https://admin.role.ec';
  end if;
end $verify$;

commit;