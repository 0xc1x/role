-- Client read/write boundary closure, platform-stats lockdown, and Vault-backed
-- internal Edge Function dispatch.
--
-- SAFETY: apply only to a reviewed Supabase development branch. Do not apply to
-- production directly. Before promoting, verify:
--   1. public.businesses SELECT for anon/authenticated (column-scoped) and that
--      the API (service_role) still reads the full row for admin flows;
--   2. offers write flow for business owners (create/edit/deactivate) still works
--      through the API and the mobile owner panel;
--   3. order_events are still inserted server-side (status RPC / API) and the
--      push trigger still fires WITH THE WEBHOOK ENVELOPE (type/table/schema/
--      record). The Edge Function silently skips any other shape, so verify a
--      real push reaches the device after promoting;
--   4. each cron job below reaches its Edge Function with the rotated secret.
--
-- SECRET HANDLING: this file contains no secret literal. The internal secret is
-- read from vault.decrypted_secrets. On an environment where the legacy
-- function source is absent, the operator MUST seed Vault first (see the
-- "operator prerequisite" block) or the migration aborts without side effects.
--
-- Rollback note: restoring broad grants/policies, the old get_platform_stats
-- body, or a prosrc with an embedded secret reopens the exact findings this
-- file closes. A rollback must be a separately reviewed security migration.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Vault prerequisite (fail closed, no secret literals)
-- ─────────────────────────────────────────────────────────────────────────────
-- Required secret names read by this migration:
--   supabase_url        -> https://<project-ref>.supabase.co
--   supabase_anon_key   -> legacy anon/publishable key used for the apikey header
--   internal_secret     -> shared secret between cron and the Edge Functions
--
-- On an environment where the legacy handle_order_event_push() still exists,
-- section 0.1 bootstraps a ROTATED random internal_secret from that source
-- without reading, returning, or printing the legacy value.
-- On a fresh environment, seed the three secrets manually BEFORE applying:
--   select vault.create_secret('https://<ref>.supabase.co', 'supabase_url');
--   select vault.create_secret('<anon-key>', 'supabase_anon_key');
--   select vault.create_secret('<new-internal-secret>', 'internal_secret');

do $$
declare
  legacy_src text;
  legacy_url text;
  legacy_anon text;
  v_secret text;
  v_slug text;
begin
  select p.prosrc into legacy_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'handle_order_event_push';

  if legacy_src is null then
    -- Fresh environment: operator must have seeded Vault. Fail closed and
    -- loudly rather than deploying a dispatcher that cannot authenticate.
    if not exists (select 1 from vault.decrypted_secrets where name = 'internal_secret')
       or not exists (select 1 from vault.decrypted_secrets where name = 'supabase_url')
       or not exists (select 1 from vault.decrypted_secrets where name = 'supabase_anon_key') then
      raise exception
        'Vault is missing required secrets (internal_secret, supabase_url, supabase_anon_key) and no legacy handle_order_event_push() source exists to bootstrap from. Seed Vault, then re-run.';
    end if;
    return;
  end if;

  -- 0.1 Rotate the internal secret.
  --
  -- The legacy function source is NOT parsed for a secret value: its literal is
  -- assigned to a plpgsql variable, not embedded in the x-internal-secret header
  -- literal this pattern would require, so a regex claiming to extract it would
  -- silently never match. Detection is by the mere presence of the legacy
  -- function, and a NEW random value is generated. The old credential therefore
  -- stops working as soon as the Edge function secrets are synced below.
  legacy_url := (regexp_match(legacy_src, '(https://[a-z0-9-]+\.supabase\.co)'))[1];
  legacy_anon := (regexp_match(
    legacy_src,
    '(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})'
  ))[1];

  if exists (select 1 from vault.decrypted_secrets where name = 'internal_secret') then
    -- Already bootstrapped (re-run): keep the existing value, never re-rotate,
    -- otherwise every re-apply would invalidate the live Edge functions.
    null;
  else
    -- pgcrypto lives in the `extensions` schema on Supabase, so it must be
    -- schema-qualified: an unqualified call fails when search_path is empty.
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'internal_secret',
      'Shared secret for cron -> Edge Function dispatch. Rotated by migration 20260926000004.'
    );
  end if;

  if legacy_url is not null
     and not exists (select 1 from vault.decrypted_secrets where name = 'supabase_url') then
    perform vault.create_secret(legacy_url, 'supabase_url', 'Supabase project URL.');
  end if;

  if legacy_anon is not null
     and not exists (select 1 from vault.decrypted_secrets where name = 'supabase_anon_key') then
    perform vault.create_secret(legacy_anon, 'supabase_anon_key', 'Supabase anon key for Edge dispatch.');
  end if;

  -- 0.2 Sync the rotated secret into the per-function Vault entries that
  -- Supabase injects as Deno env vars. Without this the newly rotated secret
  -- would exist only in the database and every dispatch would 401.
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'internal_secret';

  if v_secret is null then
    raise exception 'internal_secret missing from Vault after rotation; cannot sync Edge function secrets.';
  end if;

  foreach v_slug in array array[
    'handle-order-event',
    'handle-pickup-reminders',
    'handle-weekly-summary',
    'dispatch-nearby-offers'
  ] loop
    if exists (
      select 1 from vault.secrets
      where name = 'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET'
    ) then
      -- update_secret(secret_id, new_secret, new_name, new_description, new_key_id):
      -- it takes the secret id, and the name/description are separate arguments.
      -- Passing a description into the name slot would rename the secret and
      -- break the supabase_functions_secret_<slug>_INTERNAL_SECRET convention.
      perform vault.update_secret(
        (
          select id from vault.secrets
          where name = 'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET'
        ),
        v_secret,
        'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET',
        'INTERNAL_SECRET for ' || v_slug || ', synced by migration 20260926000004.'
      );
    else
      perform vault.create_secret(
        v_secret,
        'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET',
        'INTERNAL_SECRET for ' || v_slug || ', synced by migration 20260926000004.'
      );
    end if;
  end loop;

  -- Informational only: the value is never returned, logged, or printed.
  raise notice 'Internal secret rotated and synced to 4 Edge function secret entries.';
end
$$;

-- 0.3 Same sync for a fresh environment, where section 0 returns early because
-- the operator seeded Vault manually. Without this the seeded secret would never
-- reach the Edge functions. Runs in its own block so the fail-closed check above
-- is not bypassed.
do $$
declare
  v_secret text;
  v_slug text;
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'internal_secret';

  if v_secret is null then
    raise exception 'internal_secret missing from Vault; cannot sync Edge function secrets.';
  end if;

  foreach v_slug in array array[
    'handle-order-event',
    'handle-pickup-reminders',
    'handle-weekly-summary',
    'dispatch-nearby-offers'
  ] loop
    if exists (
      select 1 from vault.secrets
      where name = 'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET'
    ) then
      perform vault.update_secret(
        (
          select id from vault.secrets
          where name = 'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET'
        ),
        v_secret,
        'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET',
        'INTERNAL_SECRET for ' || v_slug || ', synced by migration 20260926000004.'
      );
    else
      perform vault.create_secret(
        v_secret,
        'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET',
        'INTERNAL_SECRET for ' || v_slug || ', synced by migration 20260926000004.'
      );
    end if;
  end loop;

  raise notice 'Internal secret synced to 4 Edge function secret entries.';
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. order_events: the database trigger is the only authority
-- ─────────────────────────────────────────────────────────────────────────────
-- trg_order_event_push is AFTER INSERT ... FOR EACH ROW and performs outbound
-- HTTP. Any client INSERT is therefore an unauthenticated push primitive, so
-- writes are removed from client roles entirely. The API (service_role) and the
-- status RPC continue to insert.

revoke insert, update, delete, truncate on table public.order_events from anon, authenticated;
revoke insert, update, delete, truncate on table public.order_events from public;

drop policy if exists "Users can insert own order events" on public.order_events;
drop policy if exists "Business can insert own order events" on public.order_events;

comment on table public.order_events is
  'Append-only event log. Only service_role and server-side RPCs may insert; trg_order_event_push dispatches notifications.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. businesses: public read is column-scoped
-- ─────────────────────────────────────────────────────────────────────────────
-- anon/authenticated previously had table-wide SELECT, which exposed balance,
-- commission_rate, owner_id and the moderation fields for every active
-- business. Mobile reads the public catalog; admin reads go through the API
-- with service_role, so nothing legitimate needs the platform columns.

revoke all on table public.businesses from anon, authenticated;

grant select (
  id,
  name,
  type,
  slug,
  image,
  cover_image,
  rating,
  review_count,
  description,
  phone,
  email,
  website,
  is_active,
  created_at,
  updated_at,
  currency
) on table public.businesses to anon;

-- owner_id is granted to authenticated only: the owner panel and its RLS
-- predicates need it, anon never does. Platform-only columns stay withheld.
grant select (
  owner_id,
  id,
  name,
  type,
  slug,
  image,
  cover_image,
  rating,
  review_count,
  description,
  phone,
  email,
  website,
  is_active,
  created_at,
  updated_at,
  currency
) on table public.businesses to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. offers: column-scoped writes, ownership RLS preserved
-- ─────────────────────────────────────────────────────────────────────────────
-- rating and review_count are derived by review triggers. Owners could write
-- them directly through a table-level UPDATE grant.

revoke insert, update, delete, truncate, trigger, references
  on table public.offers from anon, authenticated;

grant insert (
  business_id,
  business_location_id,
  title,
  description,
  image,
  original_price,
  discounted_price,
  discount_percentage,
  stock,
  initial_stock,
  pickup_start,
  pickup_end,
  is_active,
  includes,
  allergens
) on table public.offers to authenticated;

grant update (
  title,
  description,
  image,
  original_price,
  discounted_price,
  discount_percentage,
  pickup_start,
  pickup_end,
  is_active,
  includes,
  allergens
) on table public.offers to authenticated;

-- Offer deactivation for a business that is not yet approved is a platform
-- decision. The API (service_role) enforces this server-side; client writes
-- that need it must go through the API, not a direct table update.

grant delete on table public.offers to authenticated;

-- offers.id is uuid with no identity/sequence, so no sequence grant is needed.
-- Column-level INSERT/UPDATE above deliberately omit stock from UPDATE: stock is
-- moved by the server-side reservation RPCs (reserve_offer / cancel_order) and
-- by expireStale, never by an owner editing their own offer. INSERT may set the
-- opening quantity via initial_stock.
revoke update (stock) on table public.offers from anon, authenticated;

-- Covers offers_location_business_fkey. Leading column matches the FK, so
-- parent-side deletes/joins on location no longer scan active offers.
create index if not exists idx_offers_location_business
  on public.offers using btree (business_location_id, business_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. get_platform_stats: service_role only, fixed search_path
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_platform_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'businesses', (select count(*) from public.businesses where verification_status = 'approved' and is_active),
    'meals', (select count(*) from public.orders where status in ('completed', 'picked_up'))
  );
$$;

revoke all on function public.get_platform_stats() from public;
revoke all on function public.get_platform_stats() from anon;
revoke all on function public.get_platform_stats() from authenticated;
grant execute on function public.get_platform_stats() to service_role;

-- Public aggregate for client display: counts only, no rows, no platform data.
create or replace function public.get_platform_public_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'businesses', (select count(*) from public.businesses where verification_status = 'approved' and is_active),
    'meals', (select count(*) from public.orders where status in ('completed', 'picked_up'))
  );
$$;

revoke all on function public.get_platform_public_stats() from public;
grant execute on function public.get_platform_public_stats() to anon, authenticated;

comment on function public.get_platform_public_stats() is
  'Count-only platform totals for public surfaces; exposes no rows or platform fields.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Vault-backed internal Edge Function dispatch
-- ─────────────────────────────────────────────────────────────────────────────
-- Replaces the secret embedded in handle_order_event_push().prosrc and in the
-- cron.job commands. Fails closed when Vault is missing a required secret.

create or replace function public.invoke_internal_edge_function(
  path text,
  body jsonb default '{}'::jsonb
)
-- path must be a bare function slug; a caller-controlled path could otherwise
-- be used to reach an unintended endpoint. The allowlist is the only route.
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_anon text;
  v_secret text;
  v_request_id bigint;
begin
  -- Allowlist holds real Edge Function slugs, which differ from the cron job
  -- names: pickup_reminders_push -> handle-pickup-reminders,
  -- weekly_summary_push -> handle-weekly-summary.
  if path not in (
    'handle-order-event',
    'handle-pickup-reminders',
    'handle-weekly-summary',
    'dispatch-nearby-offers'
  ) then
    raise exception 'invoke_internal_edge_function: path is not in the allowlist';
  end if;

  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'supabase_url';
  select decrypted_secret into v_anon
  from vault.decrypted_secrets where name = 'supabase_anon_key';
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'internal_secret';

  if v_url is null or v_anon is null or v_secret is null then
    raise exception
      'invoke_internal_edge_function: missing Vault secret (supabase_url, supabase_anon_key, internal_secret)';
  end if;

  select http_post into v_request_id
  from net.http_post(
    url := v_url || '/functions/v1/' || ltrim(path, '/'),
    body := body,
    params := jsonb_build_object('headers', jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon,
      'x-internal-secret', v_secret
    )),
    timeout_milliseconds := 30000
  );

  return v_request_id;
end;
$$;

revoke all on function public.invoke_internal_edge_function(text, jsonb) from public;
revoke all on function public.invoke_internal_edge_function(text, jsonb) from anon;
revoke all on function public.invoke_internal_edge_function(text, jsonb) from authenticated;

comment on function public.invoke_internal_edge_function(text, jsonb) is
  'Dispatches an internal Edge Function using credentials from Vault. Never callable by client roles.';

-- 5.1 Replace the trigger function. No secret in prosrc.
--
-- The payload MUST stay byte-compatible with the deployed handle-order-event
-- Edge Function, which reads the Supabase webhook envelope and bails out with
-- { success, skipped: true } unless type === 'INSERT' and record is present.
-- A flattened { order_id, status, metadata } body is silently skipped, which
-- would drop every order notification without any error surface.
create or replace function public.handle_order_event_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.invoke_internal_edge_function(
    'handle-order-event',
    jsonb_build_object(
      'type', 'INSERT',
      'table', 'order_events',
      'schema', 'public',
      'record', row_to_json(new)
    )
  );
  return new;
end;
$$;

-- 5.2 Rewrite cron commands through the supported cron API. The migration role
-- cannot write cron.job directly, but can unschedule and reschedule by name.
-- Names and schedules are preserved; new jobs are active by default.
select cron.unschedule('pickup_reminders_push');
select cron.schedule(
  'pickup_reminders_push',
  '0 * * * *',
  $cmd$select public.invoke_internal_edge_function('handle-pickup-reminders', '{}'::jsonb);$cmd$
);

select cron.unschedule('weekly_summary_push');
select cron.schedule(
  'weekly_summary_push',
  '0 19 * * 0',
  $cmd$select public.invoke_internal_edge_function('handle-weekly-summary', '{}'::jsonb);$cmd$
);

select cron.unschedule('dispatch-nearby-offers');
select cron.schedule(
  'dispatch-nearby-offers',
  '0 */2 * * *',
  $cmd$select public.invoke_internal_edge_function('dispatch-nearby-offers', '{}'::jsonb);$cmd$
);

commit;
