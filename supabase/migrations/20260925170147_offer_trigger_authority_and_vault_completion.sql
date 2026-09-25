-- Close the trigger-authority gap on offers, and finish the Vault migration.
--
-- Found by a destructive role-matrix probe (real mutations as anon /
-- authenticated / a non-owning user, each rolled back), not by static review:
--
-- 1. OFFER INSERT WAS BROKEN FOR EVERY BUSINESS OWNER.
--    enforce_offer_business_availability() is a BEFORE INSERT trigger that
--    reads public.businesses.verification_status, but it was SECURITY INVOKER.
--    After migration 20260925163235 narrowed the client column grant on
--    businesses, `authenticated` could no longer read that column, so the
--    trigger raised "permission denied for table businesses" and every offer
--    creation from the mobile business panel failed. The trigger enforces an
--    integrity rule; it must not inherit the caller's read privileges.
--
-- 2. handle_offer_created_push() STILL EMBEDDED THE ROTATED SECRET.
--    20260925163235 replaced handle_order_event_push() but missed this sibling
--    trigger, so the old shared secret and the anon JWT remained in prosrc and
--    the offer-created push was authenticating with a credential that had
--    already been rotated out. It is the only public function left containing
--    a secret literal.
--
-- 3. The Vault dispatcher allowlist did not include 'handle-offer-created', so
--    the trigger could not be moved onto the Vault path without extending it.
--
-- check_offer_expiry() and handle_updated_at() are deliberately left
-- SECURITY INVOKER: they only assign NEW fields and read no table, so they
-- need no elevated privilege. sync_business_verification() is likewise
-- SECURITY INVOKER by design: businesses is not client-writable, so the
-- trigger only ever runs for the service_role API path.
--
-- ROLLBACK: reverting (1) restores a state where no merchant can create an
-- offer. Reverting (2) reintroduces a credential that has already been rotated.

begin;

-- 1. Integrity triggers that read platform-only columns must not run with the
--    caller's privileges.
create or replace function public.enforce_offer_business_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- 2. Widen the dispatcher allowlist to the endpoint this trigger actually
--    calls. The path allowlist is the only thing standing between a
--    caller-controlled value and an outbound request, so the new entry is a
--    bare slug with no leading slash and no user input.
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

-- 3. Replace the trigger body with the Vault-backed dispatcher.
create or replace function public.handle_offer_created_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- 4. Sync the rotated secret to the offer-created function so the dispatcher
--    and the function agree. Idempotent, and the value is never returned.
do $$
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
      v_secret,
      v_name,
      'INTERNAL_SECRET for handle-offer-created, synced by migration.'
    );
  else
    perform vault.create_secret(
      v_secret,
      v_name,
      'INTERNAL_SECRET for handle-offer-created, synced by migration.'
    );
  end if;
end $$;

commit;
