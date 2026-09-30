-- Make an unusable coupon fail loudly instead of charging full price.
--
-- WHY
--
-- reserve_offer resolved the coupon with a single filtered select:
--
--   select * into v_coupon from public.coupons
--    where id=p_coupon_id and is_active=true
--      and (expires_at is null or expires_at>now())
--      and (business_id=v_offer.business_id or business_id is null)
--    for update;
--   if found then ... end if;
--
-- Four different rejections -- unknown id, inactive, expired, and belonging to
-- another business -- all collapsed into "no row", and the function then carried
-- on and created the order at full price. The caller had been told the order was
-- reserved; it never learned the discount it was shown in the UI did not exist.
--
-- The same filter also made orders.coupon_id a lie. The insert stores
-- p_coupon_id verbatim, so an order created with an unresolvable coupon still
-- claimed that coupon while coupons.used_count was never incremented. Coupon
-- accounting could not reconcile, and the platform had no record of why.
--
-- WHAT CHANGES
--
-- A supplied coupon that cannot be applied now returns COUPON_NOT_APPLICABLE
-- with a reason of not_found | wrong_business | inactive | expired, BEFORE
-- stock is decremented and before the order row is written. Nothing is
-- reserved, nothing is consumed, nothing is mutated, and the client can retry
-- without the coupon.
--
-- COUPON_EXHAUSTED and COUPON_MIN_NOT_MET keep their existing codes and
-- messages: they were already loud, and folding them into the new code would
-- break any client that already handles them.
--
-- WHY THE INSERT IS NOT TOUCHED
--
-- It still stores p_coupon_id, which is now truthful by construction: the only
-- way to reach the insert with a non-null p_coupon_id is the path where the
-- coupon resolved and its discount was applied. Storing v_coupon.id instead
-- would read a record variable that is never assigned when no coupon was sent,
-- which is a runtime error in PL/pgSQL, not a null.
--
-- The idempotency replay check above this block is likewise untouched. It runs
-- before the coupon is resolved and compares against the id the client sent,
-- which is still the right notion of "the same request".
--
-- The API mirror in apps/api/src/modules/orders/orders.service.ts resolves by
-- CODE rather than id; it carries the same rejection reasons and the same
-- fail-loud behaviour.
--
-- ============================ APPLY ORDER WARNING ============================
-- The mobile app calls this function directly (ADR-0002), so this is a LIVE
-- BEHAVIOUR CHANGE for consumers: a reservation carrying an unusable coupon
-- used to succeed at full price and now fails with a reason. That is the point
-- -- a user who was shown a discount must not be charged without it -- but it
-- is still a change on the checkout path. Apply with the API mirror deployed.
--
-- ROLLBACK: revert this one function. No schema change, no data change, and no
-- order was created on the new rejection path, so there is nothing to undo.
-- ===========================================================================

begin;

-- The rewrite is asserted, not assumed: if v_old does not match the live
-- definition byte for byte, this raises and the transaction rolls back rather
-- than leaving a function that still charges full price.
do $rewrite$
declare
  v_def text;
  v_old constant text := $q$  if p_coupon_id is not null then
    select * into v_coupon from public.coupons where id=p_coupon_id and is_active=true and (expires_at is null or expires_at>now()) and (business_id=v_offer.business_id or business_id is null) for update;
    if found then
      if v_coupon.max_uses is not null and v_coupon.used_count>=v_coupon.max_uses then return jsonb_build_object('success',false,'error','COUPON_EXHAUSTED','message','Cupon agotado'); end if;
      if v_coupon.min_order_amount>v_price then return jsonb_build_object('success',false,'error','COUPON_MIN_NOT_MET','message','Monto minimo no alcanzado para el cupon'); end if;
      if v_coupon.type='percentage' then v_discount:=least(v_price*v_coupon.value/100,v_price); else v_discount:=least(v_coupon.value,v_price); end if;
      v_price:=greatest(v_price-v_discount,0);
      update public.coupons set used_count=used_count+1 where id=p_coupon_id;
    end if;
  end if;$q$;
  v_new constant text := $q$  if p_coupon_id is not null then
    select * into v_coupon from public.coupons where id=p_coupon_id for update;
    if not found then
      return jsonb_build_object('success',false,'error','COUPON_NOT_APPLICABLE','reason','not_found','message','El cupon no existe');
    end if;
    if v_coupon.business_id is not null and v_coupon.business_id<>v_offer.business_id then
      return jsonb_build_object('success',false,'error','COUPON_NOT_APPLICABLE','reason','wrong_business','message','El cupon pertenece a otro negocio');
    end if;
    if v_coupon.is_active is not true then
      return jsonb_build_object('success',false,'error','COUPON_NOT_APPLICABLE','reason','inactive','message','El cupon esta inactivo');
    end if;
    if v_coupon.expires_at is not null and v_coupon.expires_at<=now() then
      return jsonb_build_object('success',false,'error','COUPON_NOT_APPLICABLE','reason','expired','message','El cupon ya vencio');
    end if;
    if v_coupon.max_uses is not null and v_coupon.used_count>=v_coupon.max_uses then
      return jsonb_build_object('success',false,'error','COUPON_EXHAUSTED','message','Cupon agotado');
    end if;
    if v_coupon.min_order_amount>v_price then
      return jsonb_build_object('success',false,'error','COUPON_MIN_NOT_MET','message','Monto minimo no alcanzado para el cupon');
    end if;
    if v_coupon.type='percentage' then v_discount:=least(v_price*v_coupon.value/100,v_price); else v_discount:=least(v_coupon.value,v_price); end if;
    v_price:=greatest(v_price-v_discount,0);
    update public.coupons set used_count=used_count+1 where id=p_coupon_id;
  end if;$q$;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'reserve_offer'
    and pg_get_function_identity_arguments(p.oid)
        = 'p_user_id uuid, p_offer_id uuid, p_coupon_id uuid, p_idempotency_key text';

  if v_def is null then
    raise exception 'reserve_offer(uuid,uuid,uuid,text) not found';
  end if;

  if position(v_old in v_def) = 0 then
    raise exception 'reserve_offer coupon block does not match the expected text';
  end if;

  execute replace(v_def, v_old, v_new);
end $rewrite$;

comment on function public.reserve_offer(uuid,uuid,uuid,text) is
  'Reserves an offer. A supplied coupon that cannot be applied returns COUPON_NOT_APPLICABLE with a reason (not_found, wrong_business, inactive, expired) before any stock or order row is touched; COUPON_EXHAUSTED and COUPON_MIN_NOT_MET are returned when the coupon resolves but cannot be honoured.';

commit;