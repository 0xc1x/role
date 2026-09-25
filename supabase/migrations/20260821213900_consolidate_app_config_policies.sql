-- Una sola política por acción evita el aviso multiple_permissive_policies.
drop policy if exists "Public can read active app config" on public.app_config;
drop policy if exists "Admins manage app config" on public.app_config;

create policy "Read public app config"
  on public.app_config
  for select
  to anon, authenticated
  using ((active and is_public) or (select auth_helpers.my_role()) = 'admin');

create policy "Admins insert app config"
  on public.app_config
  for insert
  to authenticated
  with check ((select auth_helpers.my_role()) = 'admin');

create policy "Admins update app config"
  on public.app_config
  for update
  to authenticated
  using ((select auth_helpers.my_role()) = 'admin')
  with check ((select auth_helpers.my_role()) = 'admin');

create policy "Admins delete app config"
  on public.app_config
  for delete
  to authenticated
  using ((select auth_helpers.my_role()) = 'admin');