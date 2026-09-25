CREATE OR REPLACE FUNCTION public.cancel_order(p_user_id uuid, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order RECORD;
  v_previous_status public.order_status;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'ORDER_NOT_FOUND',
      'message', 'Pedido no encontrado'
    );
  END IF;

  IF v_order.user_id != p_user_id THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'NOT_ORDER_OWNER',
      'message', 'No eres el dueño de este pedido'
    );
  END IF;

  IF v_order.status NOT IN ('pending', 'confirmed', 'ready_for_pickup') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'CANNOT_CANCEL',
      'message', 'Este pedido no se puede cancelar'
    );
  END IF;

  v_previous_status := v_order.status;

  UPDATE public.orders
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.offers
  SET stock = stock + 1
  WHERE id = v_order.offer_id;

  INSERT INTO public.order_events (order_id, status, previous_status, changed_by, reason)
  VALUES (p_order_id, 'cancelled'::public.order_status, v_previous_status, p_user_id, 'Cancelado por el usuario');

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'cancelled'
  );
END;
$function$;