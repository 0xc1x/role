begin;

create or replace function public.invoke_internal_edge_function(
  path text,
  body jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $fn$
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
$fn$;

revoke all on function public.invoke_internal_edge_function(text, jsonb) from public;
revoke all on function public.invoke_internal_edge_function(text, jsonb) from anon;
revoke all on function public.invoke_internal_edge_function(text, jsonb) from authenticated;

commit;
