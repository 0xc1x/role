-- 1) RLS de slides estaba habilitado pero sin políticas (tabla inaccesible vía API).
create policy "Public can read active slides"
  on public.slides
  for select
  to anon, authenticated
  using (active and deleted_at is null);

create policy "Admins manage slides"
  on public.slides
  for all
  to authenticated
  using (auth_helpers.my_role() = 'admin')
  with check (auth_helpers.my_role() = 'admin');

-- 2) search_path fijo en funciones con search_path mutable.
alter function public.handle_order_event_push() set search_path = '';
alter function public.cleanup_old_device_tokens() set search_path = '';

-- 3) Funciones solo para triggers/cron: revocar EXECUTE a clientes.
revoke execute on function public.cleanup_old_device_tokens() from anon, authenticated, public;
revoke execute on function public.update_offer_rating() from anon, authenticated, public;
revoke execute on function public.create_business_notification_preferences() from anon, authenticated, public;
revoke execute on function public.handle_order_event_push() from anon, authenticated, public;