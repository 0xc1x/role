-- Endurece grants de RPCs SECURITY DEFINER (advisor 0028/0029).
-- Client-facing (mobile autenticado): sin anon.
revoke execute on function public.reserve_offer(uuid, uuid, uuid) from public, anon;
grant execute on function public.reserve_offer(uuid, uuid, uuid) to authenticated;

revoke execute on function public.cancel_order(uuid, uuid, uuid) from public, anon;
grant execute on function public.cancel_order(uuid, uuid, uuid) to authenticated;

revoke execute on function public.validate_pickup_code(uuid, text) from public, anon;
grant execute on function public.validate_pickup_code(uuid, text) to authenticated;

revoke execute on function public.get_platform_stats() from public, anon;
grant execute on function public.get_platform_stats() to authenticated;

-- Solo triggers/cron: el dueño (postgres) conserva execute; ningún rol HTTP.
revoke execute on function public.accrue_order_earnings() from public, anon, authenticated;
revoke execute on function public.notify_business_pending() from public, anon, authenticated;
revoke execute on function public.notify_business_verification() from public, anon, authenticated;
revoke execute on function public.generate_payouts() from public, anon, authenticated;
revoke execute on function public.sync_business_verification() from public, anon, authenticated;

-- advisor 0011: search_path fijo (trigger sin acceso a tablas)
alter function public.sync_business_verification() set search_path = '';