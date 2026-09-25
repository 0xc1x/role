-- Binding de identidad: p_user_id debe coincidir con el caller autenticado.
-- Evita reservas/cancelaciones a nombre de terceros (con grants ya revocados
-- a anon, service_role sigue habilitado: auth.uid() null).

create or replace function public.reserve_offer(p_user_id uuid, p_offer_id uuid, p_coupon_id uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 SECURITY DEFINER
 SET search_path TO ''
as $function$
DECLARE
  v_offer RECORD;
  v_order_id UUID;
  v_order_number TEXT;
  v_pickup_code TEXT;
  v_price NUMERIC(10,2);
  v_original_price NUMERIC(10,2);
  v_coupon RECORD;
  v_discount NUMERIC(10,2) := 0;
  v_commission_rate NUMERIC(10,4);
  v_platform_fee NUMERIC(12,2);
BEGIN
  -- Un usuario autenticado solo reserva en su nombre (service_role: uid null).
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'UNAUTHORIZED',
      'message', 'No puedes reservar en nombre de otro usuario'
    );
  END IF;

  SELECT * INTO v_offer
  FROM public.offers
  WHERE id = p_offer_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'OFFER_NOT_FOUND',
      'message', 'Oferta no encontrada o inactiva'
    );
  END IF;

  IF v_offer.stock <= 0 THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'OFFER_OUT_OF_STOCK',
      'message', 'Oferta agotada'
    );
  END IF;

  IF now() > v_offer.pickup_end THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'OFFER_EXPIRED',
      'message', 'Ventana de pickup cerrada'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE user_id = p_user_id
      AND offer_id = p_offer_id
      AND status IN ('pending', 'confirmed', 'ready_for_pickup')
  ) THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'DUPLICATE_RESERVATION',
      'message', 'Ya tienes una reserva activa para esta oferta'
    );
  END IF;

  -- Tarifa vigente del negocio (snapshot: cambios futuros no reescriben historia)
  SELECT commission_rate INTO v_commission_rate
  FROM public.businesses
  WHERE id = v_offer.business_id;

  v_price := v_offer.discounted_price;
  v_original_price := v_offer.original_price;

  IF p_coupon_id IS NOT NULL THEN
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE id = p_coupon_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
      AND (business_id = v_offer.business_id OR business_id IS NULL)
    FOR UPDATE;

    IF FOUND THEN
      IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
        RETURN jsonb_build_object('success', false, 'error', 'COUPON_EXHAUSTED',
          'message', 'Cupon agotado');
      END IF;

      IF v_coupon.min_order_amount > v_price THEN
        RETURN jsonb_build_object('success', false, 'error', 'COUPON_MIN_NOT_MET',
          'message', 'Monto minimo no alcanzado para el cupon');
      END IF;

      IF v_coupon.type = 'percentage' THEN
        v_discount := LEAST(v_price * v_coupon.value / 100, v_price);
      ELSE
        v_discount := LEAST(v_coupon.value, v_price);
      END IF;

      v_price := GREATEST(v_price - v_discount, 0);

      UPDATE public.coupons
      SET used_count = used_count + 1
      WHERE id = p_coupon_id;
    END IF;
  END IF;

  UPDATE public.offers
  SET stock = stock - 1
  WHERE id = p_offer_id AND stock > 0;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'OFFER_OUT_OF_STOCK',
      'message', 'Oferta agotada (condicion de carrera)'
    );
  END IF;

  -- Comisión sobre el precio final (tras cupón)
  v_platform_fee := round(v_price * coalesce(v_commission_rate, 0), 2);

  v_order_number := public.generate_order_number();
  v_pickup_code := public.generate_pickup_code();

  INSERT INTO public.orders (
    user_id, offer_id, business_id, order_number,
    status, price, original_price, pickup_code, coupon_id,
    commission_rate, platform_fee, net_amount
  ) VALUES (
    p_user_id, p_offer_id, v_offer.business_id, v_order_number,
    'pending', v_price, v_original_price, v_pickup_code, p_coupon_id,
    coalesce(v_commission_rate, 0), v_platform_fee, v_price - v_platform_fee
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_events (order_id, status, previous_status, changed_by, reason)
  VALUES (v_order_id, 'pending', NULL, p_user_id, 'Reserva creada');

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'pickup_code', v_pickup_code,
    'price', v_price,
    'original_price', v_original_price,
    'discount', v_discount,
    'platform_fee', v_platform_fee,
    'net_amount', v_price - v_platform_fee,
    'status', 'pending'
  );
END;
$function$;

create or replace function public.cancel_order(p_user_id uuid DEFAULT NULL::uuid, p_order_id uuid DEFAULT NULL::uuid, p_business_id uuid DEFAULT NULL::uuid)
 returns jsonb
 language plpgsql
 SECURITY DEFINER
 SET search_path TO ''
as $function$
DECLARE
  v_order RECORD;
BEGIN
  -- Ruta consumidor: p_user_id debe ser el caller autenticado (la ruta
  -- negocio valida owner via p_business_id; service_role: uid null).
  IF p_user_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'NOT_ORDER_OWNER',
      'message', 'No eres el dueño de este pedido'
    );
  END IF;

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

  -- Actor: negocio propietario (p_business_id) o consumidor dueño (p_user_id)
  IF p_business_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = p_business_id
        AND b.owner_id = auth.uid()
    ) THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'NOT_ORDER_OWNER',
        'message', 'No eres el dueño de este pedido'
      );
    END IF;

    IF v_order.business_id != p_business_id THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'NOT_ORDER_OWNER',
        'message', 'No eres el dueño de este pedido'
      );
    END IF;
  ELSE
    IF p_user_id IS NULL OR v_order.user_id != p_user_id THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'NOT_ORDER_OWNER',
        'message', 'No eres el dueño de este pedido'
      );
    END IF;
  END IF;

  IF v_order.status NOT IN ('pending', 'confirmed', 'ready_for_pickup') THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'CANNOT_CANCEL',
      'message', 'Este pedido no se puede cancelar'
    );
  END IF;

  UPDATE public.orders
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_order_id;

  UPDATE public.offers
  SET stock = stock + 1
  WHERE id = v_order.offer_id;

  -- order_events es creado por el trigger on_order_status_change (evita duplicado)
  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'cancelled'
  );
END;
$function$;