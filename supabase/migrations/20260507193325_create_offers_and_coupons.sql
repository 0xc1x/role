-- ============================================
-- FASE 2.3: offers, coupons
-- ============================================

-- ============================================
-- offers
-- ============================================
CREATE TABLE public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  image TEXT,
  category TEXT,
  original_price NUMERIC(10,2) NOT NULL CHECK (original_price > 0),
  discounted_price NUMERIC(10,2) NOT NULL CHECK (discounted_price > 0),
  discount_percentage NUMERIC(5,2) GENERATED ALWAYS AS (
    ROUND(((original_price - discounted_price) / original_price * 100)::numeric, 2)
  ) STORED,
  rating NUMERIC(3,2) DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 1 CHECK (stock >= 0),
  initial_stock INTEGER NOT NULL DEFAULT 1 CHECK (initial_stock >= 0),
  pickup_start TIMESTAMPTZ NOT NULL,
  pickup_end TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pickup_end_after_start CHECK (pickup_end > pickup_start),
  CONSTRAINT discounted_less_than_original CHECK (discounted_price <= original_price)
);

-- Indexes
CREATE INDEX idx_offers_business ON public.offers(business_id);
CREATE INDEX idx_offers_active ON public.offers(is_active) WHERE is_active = true;
CREATE INDEX idx_offers_pickup_window ON public.offers(pickup_start, pickup_end) WHERE is_active = true;
CREATE INDEX idx_offers_category ON public.offers(category) WHERE is_active = true;
CREATE INDEX idx_offers_price ON public.offers(discounted_price) WHERE is_active = true;
CREATE INDEX idx_offers_stock ON public.offers(stock) WHERE is_active = true AND stock > 0;

-- Trigger for updated_at
CREATE TRIGGER set_offers_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable RLS
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- ============================================
-- coupons
-- ============================================
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type public.coupon_type NOT NULL,
  value NUMERIC(10,2) NOT NULL CHECK (value > 0),
  min_order_amount NUMERIC(10,2) DEFAULT 0,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, code)
);

CREATE INDEX idx_coupons_business ON public.coupons(business_id);
CREATE INDEX idx_coupons_code ON public.coupons(code) WHERE is_active = true;
CREATE INDEX idx_coupons_active ON public.coupons(is_active) WHERE is_active = true;

CREATE TRIGGER set_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for offers
-- ============================================
-- Anyone can view active offers with stock
CREATE POLICY "Anyone can view active offers"
  ON public.offers FOR SELECT
  USING (is_active = true);

-- Business owners can view all their own offers (even inactive)
CREATE POLICY "Owners can view own offers"
  ON public.offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = business_id AND owner_id = auth.uid()
    )
  );

-- Business owners can insert offers for their business
CREATE POLICY "Owners can insert own offers"
  ON public.offers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = business_id AND owner_id = auth.uid()
    )
  );

-- Business owners can update offers for their business
CREATE POLICY "Owners can update own offers"
  ON public.offers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = business_id AND owner_id = auth.uid()
    )
  );

-- Business owners can delete offers for their business
CREATE POLICY "Owners can delete own offers"
  ON public.offers FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = business_id AND owner_id = auth.uid()
    )
  );

-- Admins full access
CREATE POLICY "Admins full access on offers"
  ON public.offers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS Policies for coupons
-- ============================================
-- Anyone can view active coupons
CREATE POLICY "Anyone can view active coupons"
  ON public.coupons FOR SELECT
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Business owners can manage their coupons
CREATE POLICY "Owners can manage own coupons"
  ON public.coupons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = business_id AND owner_id = auth.uid()
    )
  );

-- Admins full access
CREATE POLICY "Admins full access on coupons"
  ON public.coupons FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Grant access
GRANT SELECT ON public.offers TO anon, authenticated;
GRANT SELECT ON public.coupons TO anon, authenticated;