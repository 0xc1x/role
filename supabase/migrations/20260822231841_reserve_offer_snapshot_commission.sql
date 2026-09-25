create or replace function public.reserve_offer(
  p_user_id uuid,
  p_offer_id uuid,
  p_coupon_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      AND business_id = v_offer.business_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
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
$$;