create policy "Admins can view all business members"
  on public.business_members
  for select
  to authenticated
  using ((select auth_helpers.my_role()) = 'admin'::app_role);