-- ============================================
-- FASE 2.4: orders, order_events
-- ============================================

-- ============================================
-- orders
-- ============================================
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL UNIQUE,
  status public.order_status NOT NULL DEFAULT 'pending',
  price NUMERIC(10,2) NOT NULL CHECK (price > 0),
  original_price NUMERIC(10,2) NOT NULL CHECK (original_price > 0),
  pickup_code TEXT NOT NULL,
  pickup_time TIMESTAMPTZ,
  coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_offer ON public.orders(offer_id);
CREATE INDEX idx_orders_business ON public.orders(business_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_number ON public.orders(order_number);
CREATE INDEX idx_orders_pickup_code ON public.orders(pickup_code) WHERE status IN ('confirmed', 'ready_for_pickup');
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- ============================================
-- order_events (audit trail for order state changes)
-- ============================================
CREATE TABLE public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  previous_status public.order_status,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_events_order ON public.order_events(order_id);
CREATE INDEX idx_order_events_created ON public.order_events(created_at DESC);

-- Enable RLS
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for orders
-- ============================================
-- Users can view their own orders
CREATE POLICY "Users can view own orders"
  ON public.orders FOR SELECT
  USING (user_id = auth.uid());

-- Business owners can view orders for their offers
CREATE POLICY "Business can view own orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id AND b.owner_id = auth.uid()
    )
  );

-- Admins can view all orders
CREATE POLICY "Admins can view all orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can insert orders (reservation flow via edge function, but allow direct for now)
CREATE POLICY "Users can insert own orders"
  ON public.orders FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Business owners can update orders for their business (status changes)
CREATE POLICY "Business can update own orders"
  ON public.orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id AND b.owner_id = auth.uid()
    )
  );

-- Users can cancel their own pending orders
CREATE POLICY "Users can cancel own pending orders"
  ON public.orders FOR UPDATE
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

-- Admins can update all orders
CREATE POLICY "Admins can update all orders"
  ON public.orders FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS Policies for order_events
-- ============================================
-- Users can view events for their own orders
CREATE POLICY "Users can view own order events"
  ON public.order_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = order_id AND user_id = auth.uid()
    )
  );

-- Business owners can view events for their orders
CREATE POLICY "Business can view own order events"
  ON public.order_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.businesses b ON b.id = o.business_id
      WHERE o.id = order_id AND b.owner_id = auth.uid()
    )
  );

-- System can insert order events (via edge functions / triggers)
CREATE POLICY "System can insert order events"
  ON public.order_events FOR INSERT
  WITH CHECK (true);

-- Admins can view all order events
CREATE POLICY "Admins can view all order events"
  ON public.order_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Grant access
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.order_events TO authenticated;