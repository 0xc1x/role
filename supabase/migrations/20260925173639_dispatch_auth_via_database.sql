-- Authenticate database -> Edge Function dispatch through the database itself.

begin;

create or replace function public.internal_dispatch_secret_matches(candidate text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'internal_secret'
      and decrypted_secret = candidate
  );
$fn$;

revoke all on function public.internal_dispatch_secret_matches(text) from public;
revoke all on function public.internal_dispatch_secret_matches(text) from anon;
revoke all on function public.internal_dispatch_secret_matches(text) from authenticated;
grant execute on function public.internal_dispatch_secret_matches(text) to service_role;

comment on function public.internal_dispatch_secret_matches(text) is
  'Boolean check for database -> Edge Function dispatch auth. Replaces platform secret injection, which is not guaranteed. Never callable by client roles.';

commit;
