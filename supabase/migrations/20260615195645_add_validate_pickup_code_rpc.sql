create or replace function public.validate_pickup_code(
  p_order_id uuid,
  p_pickup_code text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order record;
  v_business_id uuid;
begin
  -- Verify the authenticated user owns the business of this order
  select b.id into v_business_id
  from public.businesses b
  join public.orders o on o.business_id = b.id
  where o.id = p_order_id
    and b.owner_id = auth.uid();

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'No tienes permiso para validar este pedido'
    );
  end if;

  -- Lock and get the order
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'ORDER_NOT_FOUND',
      'message', 'Pedido no encontrado'
    );
  end if;

  -- Validate pickup code
  if v_order.pickup_code <> p_pickup_code then
    return jsonb_build_object(
      'success', false,
      'error', 'INVALID_CODE',
      'message', 'Código de recogida inválido'
    );
  end if;

  -- Validate status is ready_for_pickup
  if v_order.status <> 'ready_for_pickup' then
    return jsonb_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'El pedido no está listo para recoger'
    );
  end if;

  -- Update order status
  update public.orders
  set status = 'completed',
      updated_at = now()
  where id = p_order_id;

  -- Log event
  insert into public.order_events (
    order_id, status, previous_status, changed_by, metadata
  ) values (
    p_order_id, 'completed', v_order.status, auth.uid(),
    jsonb_build_object('method', 'pickup_code')
  );

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'completed'
  );
end;
$function$;

grant execute on function public.validate_pickup_code(uuid, text) to authenticated;