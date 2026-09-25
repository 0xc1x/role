-- Authenticate database -> Edge Function dispatch through the database itself.
--
-- WHY THIS EXISTS
--
-- The internal dispatch secret was moved out of function source and into Vault
-- so it would be rotatable, and the functions were changed to read
-- Deno.env.get("INTERNAL_SECRET"). The Supabase Edge Runtime did not pick the
-- secret up: the `supabase_functions_secret_<slug>_INTERNAL_SECRET` rows exist
-- in Vault and match `internal_secret` byte for byte, yet every dispatch
-- returned 401 {"error":"Unauthorized"} while the gateway demonstrably
-- forwarded the request to the function.
--
-- That makes platform secret injection a load-bearing, unverified dependency
-- for a feature that must not fail silently. The Edge Runtime injects
-- SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY reliably (send-push-notification
-- depends on it and works), so the dispatch check is moved onto a primitive
-- that is already proven in this project: the function calls back into the
-- database with its service-role client and asks a yes/no question.
--
-- The secret never crosses the wire and is never held in function memory. Only
-- a boolean travels, so this is strictly narrower than shipping the value.
--
-- SECURITY
--   * SECURITY DEFINER + fixed empty search_path: the function must read
--     vault.decrypted_secrets, which no client role can see.
--   * execute is granted to service_role ONLY. Granting it to anon or
--     authenticated would turn it into an oracle for guessing the secret.
--   * revoke from public covers the implicit PUBLIC execute on new functions.
--
-- ROLLBACK: reverting this leaves the functions calling an RPC that no longer
-- exists, and every dispatch returns 401. Restore the env-based check in the
-- same change if you remove this function.

begin;

create or replace function public.internal_dispatch_secret_matches(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'internal_secret'
      and decrypted_secret = candidate
  );
$$;

revoke all on function public.internal_dispatch_secret_matches(text) from public;
revoke all on function public.internal_dispatch_secret_matches(text) from anon;
revoke all on function public.internal_dispatch_secret_matches(text) from authenticated;
grant execute on function public.internal_dispatch_secret_matches(text) to service_role;

comment on function public.internal_dispatch_secret_matches(text) is
  'Constant-shape boolean check for database -> Edge Function dispatch auth. Replaces platform secret injection, which is not guaranteed. Never callable by client roles: an exposed oracle would leak the secret by repetition.';

commit;
