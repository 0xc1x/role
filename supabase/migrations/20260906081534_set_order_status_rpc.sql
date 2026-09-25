-- Transición de estado de pedido server-side (reemplaza el UPDATE directo
-- del cliente, que hoy RLS limita a confirmed/ready_for_pickup).
-- Actor: dueño del negocio (o admin). picked_up/completed pasan por
-- validate_pickup_code (código obligatorio); expired lo fija el sistema.
create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order record;
  v_status public.order_status;
  v_is_admin boolean;
  v_is_owner boolean;
begin
  select exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'order_status' and e.enumlabel = p_status
  ) into v_is_admin;
  if not v_is_admin then
    return jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'message', 'Estado inválido');
  end if;
  v_status := p_status::public.order_status;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND', 'message', 'Pedido no encontrado');
  end if;

  v_is_admin := auth_helpers.my_role() = 'admin';
  select exists (
    select 1 from public.businesses b
    where b.id = v_order.business_id and b.owner_id = auth.uid()
  ) into v_is_owner;

  if not (v_is_owner or v_is_admin) then
    return jsonb_build_object('success', false, 'error', 'NOT_ORDER_OWNER', 'message', 'No eres el dueño de este pedido');
  end if;

  if v_order.status = v_status then
    return jsonb_build_object('success', false, 'error', 'INVALID_TRANSITION', 'message', 'El pedido ya está en ese estado');
  end if;

  -- Matriz del ciclo de vida (espejo de canTransitionTo en mobile/commons)
  if not (
    (v_order.status = 'pending' and v_status in ('confirmed', 'cancelled', 'expired')) or
    (v_order.status = 'confirmed' and v_status in ('ready_for_pickup', 'cancelled', 'expired')) or
    (v_order.status = 'ready_for_pickup' and v_status in ('picked_up', 'completed', 'cancelled', 'expired')) or
    (v_order.status = 'picked_up' and v_status = 'completed')
  ) then
    return jsonb_build_object('success', false, 'error', 'INVALID_TRANSITION', 'message', 'Transición de estado no permitida');
  end if;

  -- El negocio solo opera hasta ready_for_pickup/cancel: la entrega exige
  -- el pickup code (validate_pickup_code) y expired lo fija el sistema.
  if not v_is_admin and v_status in ('picked_up', 'completed', 'expired') then
    return jsonb_build_object('success', false, 'error', 'INVALID_TRANSITION', 'message', 'Transición reservada al sistema');
  end if;

  update public.orders
  set status = v_status,
      updated_at = now()
  where id = p_order_id;

  -- Cancelar repone stock (misma semántica que cancel_order). Los
  -- order_events los crea el trigger on_order_status_change.
  if v_status = 'cancelled' then
    update public.offers set stock = stock + 1 where id = v_order.offer_id;
  end if;

  return jsonb_build_object('success', true, 'order_id', p_order_id, 'status', v_status);
end;
$function$;

grant execute on function public.set_order_status(uuid, text) to authenticated;