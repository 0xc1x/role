-- Close the trigger-authority gap on offers, and finish the Vault migration.
--
-- Found by a destructive role-matrix probe (real mutations as anon /
-- authenticated / a non-owning user, each rolled back), not by static review.

begin;

create or replace function public.enforce_offer_business_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if not exists (
    select 1
    from public.businesses b
    where b.id = new.business_id
      and b.is_active = true
      and b.verification_status = 'approved'
  ) then
    new.is_active := false;
  end if;
  return new;
end;
$fn$;

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
$fn$;

revoke all on function public.invoke_internal_edge_function(text, jsonb) from public;
revoke all on function public.invoke_internal_edge_function(text, jsonb) from anon;
revoke all on function public.invoke_internal_edge_function(text, jsonb) from authenticated;

create or replace function public.handle_offer_created_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  perform public.invoke_internal_edge_function(
    'handle-offer-created',
    jsonb_build_object(
      'type', 'INSERT',
      'table', 'offers',
      'schema', 'public',
      'record', row_to_json(new)
    )
  );
  return new;
end;
$fn$;

do $fn$
declare
  v_secret text;
  v_name text := 'supabase_functions_secret_handle-offer-created_INTERNAL_SECRET';
begin
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'internal_secret';

  if v_secret is null then
    raise exception 'internal_secret missing from Vault; cannot sync offer-created function secret.';
  end if;

  if exists (select 1 from vault.secrets where name = v_name) then
    perform vault.update_secret(
      (select id from vault.secrets where name = v_name),
      v_secret, v_name,
      'INTERNAL_SECRET for handle-offer-created, synced by migration.'
    );
  else
    perform vault.create_secret(
      v_secret, v_name,
      'INTERNAL_SECRET for handle-offer-created, synced by migration.'
    );
  end if;
end
$fn$;

commit;
