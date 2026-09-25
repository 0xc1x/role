-- set_order_status exige auth.uid(): sin uso para anon.
revoke execute on function public.set_order_status(uuid, text) from public;
grant execute on function public.set_order_status(uuid, text) to authenticated;