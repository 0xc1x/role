-- Send the dispatch headers, which 20260925163235 silently dropped.
--
-- ROOT CAUSE (not what it first looked like)
--
-- invoke_internal_edge_function() passed its headers as
--
--     params := jsonb_build_object('headers', jsonb_build_object(...))
--
-- but pg_net's signature is
--
--     net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)
--
-- `params` is the query string, not the header map. So the object was sent as
-- a single query parameter literally named "headers" and NO HTTP header was
-- ever attached to the request.
--
-- That produced two different symptoms that both looked like an auth problem:
--
--   * Edge Functions are `verify_jwt: false`, so the gateway forwards them
--     without an apikey. The request arrived, but with no
--     `x-internal-secret`, so every function returned 401
--     {"error":"Unauthorized"} and was misdiagnosed as a missing or
--     non-injected function secret. The secret was in fact correct and
--     byte-identical in Vault the whole time.
--   * Any call that DOES require an apikey failed at the gateway with
--     {"hint":"No `apikey` request header or url param was found."}, which is
--     the unambiguous signature of missing headers rather than a bad key.
--
-- The original pre-migration function was correct: it used the named
-- `headers :=` argument. The regression came from condensing that migration
-- by hand.
--
-- The header map is now passed through the dedicated parameter. This migration
-- is intentionally narrow: it repairs the transport, and nothing else about
-- the dispatcher changes.
--
-- The edge functions currently verify the secret through
-- public.internal_dispatch_secret_matches() rather than an env var, which was
-- adopted while the 401 was wrongly attributed to secret injection. That
-- design is harmless and independent of this fix, so it is left in place; see
-- 20260925173639_dispatch_auth_via_database.sql.
--
-- ROLLBACK: reverting reintroduces a silent total notification outage. Every
-- DB -> Edge dispatch returns 401 with no error surface in Postgres.

begin;

create or replace function public.invoke_internal_edge_function(
  path text,
  body jsonb default '{}'::jsonb
)
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
  if path not in (
    'handle-order-event',
    'handle-pickup-reminders',
    'handle-weekly-summary',
    'dispatch-nearby-offers',
    'handle-offer-created'
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

  -- `headers` is its own pg_net parameter. Wrapping this map in `params`
  -- silently sends it as a query string and dispatches an unauthenticated
  -- request, which is what 20260925163235 did.
  select http_post into v_request_id
  from net.http_post(
    url := v_url || '/functions/v1/' || ltrim(path, '/'),
    body := body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon,
      'Authorization', 'Bearer ' || v_anon,
      'x-internal-secret', v_secret
    ),
    timeout_milliseconds := 30000
  );

  return v_request_id;
end;
$$;

revoke all on function public.invoke_internal_edge_function(text, jsonb) from public;
revoke all on function public.invoke_internal_edge_function(text, jsonb) from anon;
revoke all on function public.invoke_internal_edge_function(text, jsonb) from authenticated;

comment on function public.invoke_internal_edge_function(text, jsonb) is
  'Dispatches an internal Edge Function using credentials from Vault. Headers go in the dedicated pg_net `headers` argument; never inside `params`.';

commit;
