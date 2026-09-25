-- ============================================
-- Fix: Set search_path on all functions (security advisory)
-- Prevents search path injection attacks
-- ============================================

-- Fix handle_updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Fix handle_new_user (SECURITY DEFINER — critical to fix)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')::public.app_role
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Fix generate_order_number
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT AS $$
DECLARE
  today TEXT := to_char(now(), 'YYYY-MMDD');
  prefix TEXT := 'FD-' || today || '-';
  next_seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM LENGTH(prefix) + 1) AS INTEGER)
  ), 0) + 1 INTO next_seq
  FROM public.orders
  WHERE order_number LIKE prefix || '%';

  RETURN prefix || lpad(next_seq::text, 3, '0');
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Fix generate_pickup_code
CREATE OR REPLACE FUNCTION public.generate_pickup_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Fix reserve_offer (SECURITY DEFINER — critical to fix)
CREATE OR REPLACE FUNCTION public.reserve_offer(
  p_user_id UUID,
  p_offer_id UUID,
  p_coupon_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_offer RECORD;
  v_order_id UUID;
  v_order_number TEXT;
  v_pickup_code TEXT;
  v_price NUMERIC(10,2);
  v_original_price NUMERIC(10,2);
  v_coupon RECORD;
  v_discount NUMERIC(10,2) := 0;
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
        RETURN jsonb_build_object(
          'success', false, 'error', 'COUPON_EXHAUSTED',
          'message', 'Cupon agotado'
        );
      END IF;

      IF v_coupon.min_order_amount > v_price THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'COUPON_MIN_NOT_MET',
          'message', 'Monto minimo no alcanzado para el cupon'
        );
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

  v_order_number := public.generate_order_number();
  v_pickup_code := public.generate_pickup_code();

  INSERT INTO public.orders (
    user_id, offer_id, business_id, order_number,
    status, price, original_price, pickup_code, coupon_id
  ) VALUES (
    p_user_id, p_offer_id, v_offer.business_id, v_order_number,
    'pending', v_price, v_original_price, v_pickup_code, p_coupon_id
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
    'status', 'pending'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Fix update_business_rating
CREATE OR REPLACE FUNCTION public.update_business_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_business_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_business_id := OLD.business_id;
  ELSE
    v_business_id := NEW.business_id;
  END IF;

  UPDATE public.businesses
  SET
    rating = (
      SELECT COALESCE(AVG(rating), 0)
      FROM public.reviews
      WHERE business_id = v_business_id
    ),
    review_count = (
      SELECT COUNT(*)
      FROM public.reviews
      WHERE business_id = v_business_id
    )
  WHERE id = v_business_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Fix check_offer_expiry
CREATE OR REPLACE FUNCTION public.check_offer_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock = 0 AND OLD.stock > 0 THEN
    NEW.is_active := false;
  END IF;

  IF NEW.stock > 0 AND OLD.stock = 0 AND NEW.is_active = false THEN
    IF NEW.pickup_end > now() THEN
      NEW.is_active := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Fix on_order_status_change
CREATE OR REPLACE FUNCTION public.on_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_events (order_id, status, previous_status, changed_by)
    VALUES (NEW.id, NEW.status, OLD.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- Fix create_user_preferences (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.create_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Fix create_default_consents (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.create_default_consents()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_consents (user_id, consent_type, granted)
  VALUES
    (NEW.id, 'analytics', false),
    (NEW.id, 'marketing', false),
    (NEW.id, 'notifications', true)
  ON CONFLICT (user_id, consent_type) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';