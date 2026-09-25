-- ============================================
-- FASE 2.8: SQL Functions and Triggers
-- ============================================

-- ============================================
-- generate_order_number(): FD-YYYY-MMDD-NNN
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT AS $$
DECLARE
  today TEXT := to_char(now(), 'YYYY-MMDD');
  prefix TEXT := 'FD-' || today || '-';
  next_seq INTEGER;
BEGIN
  -- Get count of orders created today + 1 for sequence
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM LENGTH(prefix) + 1) AS INTEGER)
  ), 0) + 1 INTO next_seq
  FROM public.orders
  WHERE order_number LIKE prefix || '%';

  RETURN prefix || lpad(next_seq::text, 3, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- generate_pickup_code(): 6-char alphanumeric
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_pickup_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- No I,O,0,1 to avoid confusion
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- reserve_offer(): Atomic reservation with optimistic concurrency
-- Decrements stock and creates order in a single transaction
-- ============================================
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
  -- 1. Lock the offer row and check availability
  SELECT * INTO v_offer
  FROM public.offers
  WHERE id = p_offer_id AND is_active = true
  FOR UPDATE;

  -- Validate offer exists and is active
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'OFFER_NOT_FOUND',
      'message', 'Oferta no encontrada o inactiva'
    );
  END IF;

  -- Validate stock
  IF v_offer.stock <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'OFFER_OUT_OF_STOCK',
      'message', 'Oferta agotada'
    );
  END IF;

  -- Validate pickup window
  IF now() > v_offer.pickup_end THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'OFFER_EXPIRED',
      'message', 'Ventana de pickup cerrada'
    );
  END IF;

  -- 2. Check for duplicate reservation (user already has a pending/confirmed order for this offer)
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE user_id = p_user_id
      AND offer_id = p_offer_id
      AND status IN ('pending', 'confirmed', 'ready_for_pickup')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DUPLICATE_RESERVATION',
      'message', 'Ya tienes una reserva activa para esta oferta'
    );
  END IF;

  -- 3. Apply coupon if provided
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
      -- Check max uses
      IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'COUPON_EXHAUSTED',
          'message', 'Cupon agotado'
        );
      END IF;

      -- Check min order amount
      IF v_coupon.min_order_amount > v_price THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'COUPON_MIN_NOT_MET',
          'message', 'Monto minimo no alcanzado para el cupon'
        );
      END IF;

      -- Calculate discount
      IF v_coupon.type = 'percentage' THEN
        v_discount := LEAST(v_price * v_coupon.value / 100, v_price);
      ELSE
        v_discount := LEAST(v_coupon.value, v_price);
      END IF;

      v_price := GREATEST(v_price - v_discount, 0);

      -- Increment coupon usage
      UPDATE public.coupons
      SET used_count = used_count + 1
      WHERE id = p_coupon_id;
    END IF;
  END IF;

  -- 4. Decrement stock atomically
  UPDATE public.offers
  SET stock = stock - 1
  WHERE id = p_offer_id AND stock > 0;

  IF NOT FOUND THEN
    -- Race condition: stock went to 0 between check and update
    RETURN jsonb_build_object(
      'success', false,
      'error', 'OFFER_OUT_OF_STOCK',
      'message', 'Oferta agotada (condicion de carrera)'
    );
  END IF;

  -- 5. Generate order number and pickup code
  v_order_number := public.generate_order_number();
  v_pickup_code := public.generate_pickup_code();

  -- 6. Create the order
  INSERT INTO public.orders (
    user_id, offer_id, business_id, order_number,
    status, price, original_price, pickup_code, coupon_id
  ) VALUES (
    p_user_id, p_offer_id, v_offer.business_id, v_order_number,
    'pending', v_price, v_original_price, v_pickup_code, p_coupon_id
  )
  RETURNING id INTO v_order_id;

  -- 7. Create initial order event
  INSERT INTO public.order_events (order_id, status, previous_status, changed_by, reason)
  VALUES (v_order_id, 'pending', NULL, p_user_id, 'Reserva creada');

  -- 8. Return success with order data
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- update_business_rating(): Trigger on reviews
-- Recalculates business rating and review_count
-- ============================================
CREATE OR REPLACE FUNCTION public.update_business_rating()
RETURNS TRIGGER AS $$
DECLARE
  v_business_id UUID;
BEGIN
  -- Determine business_id from the review
  IF TG_OP = 'DELETE' THEN
    v_business_id := OLD.business_id;
  ELSE
    v_business_id := NEW.business_id;
  END IF;

  -- Update business rating and review count
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
$$ LANGUAGE plpgsql;

-- Trigger: update business rating on review insert/update/delete
CREATE TRIGGER on_review_change
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_business_rating();

-- ============================================
-- check_offer_expiry(): Auto-disable when stock = 0
-- ============================================
CREATE OR REPLACE FUNCTION public.check_offer_expiry()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-disable offer when stock reaches 0
  IF NEW.stock = 0 AND OLD.stock > 0 THEN
    NEW.is_active := false;
  END IF;

  -- Re-enable if stock is restocked (edge case)
  IF NEW.stock > 0 AND OLD.stock = 0 AND NEW.is_active = false THEN
    -- Only re-enable if pickup window hasn't passed
    IF NEW.pickup_end > now() THEN
      NEW.is_active := true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: auto-disable offer when stock hits 0
CREATE TRIGGER on_offer_stock_change
  BEFORE UPDATE OF stock ON public.offers
  FOR EACH ROW
  WHEN (OLD.stock IS DISTINCT FROM NEW.stock)
  EXECUTE FUNCTION public.check_offer_expiry();

-- ============================================
-- Auto-create order event on status change
-- ============================================
CREATE OR REPLACE FUNCTION public.on_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.order_events (order_id, status, previous_status, changed_by)
    VALUES (NEW.id, NEW.status, OLD.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_order_status_change
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.on_order_status_change();

-- ============================================
-- Auto-create user_preferences on profile creation
-- ============================================
CREATE OR REPLACE FUNCTION public.create_user_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_user_preferences();

-- ============================================
-- Auto-grant analytics consent default (disabled)
-- per ANALYTICS.md: "Analytics deshabilitado por defecto"
-- ============================================
CREATE OR REPLACE FUNCTION public.create_default_consents()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_consents (user_id, consent_type, granted)
  VALUES
    (NEW.id, 'analytics', false),
    (NEW.id, 'marketing', false),
    (NEW.id, 'notifications', true)  -- Push notifications ON by default
  ON CONFLICT (user_id, consent_type) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_consents
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_consents();