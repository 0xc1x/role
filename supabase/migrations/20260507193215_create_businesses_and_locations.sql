-- ============================================
-- FASE 2.2: businesses, business_locations, business_hours
-- ============================================

-- ============================================
-- businesses
-- ============================================
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.business_type NOT NULL DEFAULT 'restaurant',
  slug TEXT NOT NULL UNIQUE,
  image TEXT,
  cover_image TEXT,
  rating NUMERIC(3,2) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  description TEXT,
  address TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  website TEXT,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  commission_rate NUMERIC(5,4) DEFAULT 0.1000, -- 10% default
  balance NUMERIC(12,2) DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_businesses_owner ON public.businesses(owner_id);
CREATE INDEX idx_businesses_slug ON public.businesses(slug);
CREATE INDEX idx_businesses_active ON public.businesses(is_active) WHERE is_active = true;
CREATE INDEX idx_businesses_location ON public.businesses(latitude, longitude) WHERE is_active = true;
CREATE INDEX idx_businesses_type ON public.businesses(type) WHERE is_active = true;

-- Trigger for updated_at
CREATE TRIGGER set_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable RLS
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- ============================================
-- business_locations (additional locations per business)
-- ============================================
CREATE TABLE public.business_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_business_locations_business ON public.business_locations(business_id);
CREATE INDEX idx_business_locations_active ON public.business_locations(business_id) WHERE is_active = true;

CREATE TRIGGER set_business_locations_updated_at
  BEFORE UPDATE ON public.business_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.business_locations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- business_hours
-- ============================================
CREATE TABLE public.business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  day public.day_of_week NOT NULL,
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(business_id, day)
);

CREATE INDEX idx_business_hours_business ON public.business_hours(business_id);

CREATE TRIGGER set_business_hours_updated_at
  BEFORE UPDATE ON public.business_hours
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for businesses
-- ============================================
-- Anyone can read active businesses (guests included via anon key)
CREATE POLICY "Anyone can view active businesses"
  ON public.businesses FOR SELECT
  USING (is_active = true);

-- Business owners can view their own businesses (even inactive)
CREATE POLICY "Owners can view own businesses"
  ON public.businesses FOR SELECT
  USING (owner_id = auth.uid());

-- Business owners can insert their own businesses
CREATE POLICY "Owners can insert own businesses"
  ON public.businesses FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Business owners can update their own businesses
CREATE POLICY "Owners can update own businesses"
  ON public.businesses FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Admins can do everything on businesses
CREATE POLICY "Admins full access on businesses"
  ON public.businesses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS Policies for business_locations
-- ============================================
-- Anyone can read active locations
CREATE POLICY "Anyone can view active business locations"
  ON public.business_locations FOR SELECT
  USING (is_active = true);

-- Business owners can manage their locations
CREATE POLICY "Owners can manage own business locations"
  ON public.business_locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = business_id AND owner_id = auth.uid()
    )
  );

-- Admins full access
CREATE POLICY "Admins full access on business locations"
  ON public.business_locations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS Policies for business_hours
-- ============================================
-- Anyone can read business hours
CREATE POLICY "Anyone can view business hours"
  ON public.business_hours FOR SELECT
  USING (true);

-- Business owners can manage their hours
CREATE POLICY "Owners can manage own business hours"
  ON public.business_hours FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = business_id AND owner_id = auth.uid()
    )
  );

-- Admins full access
CREATE POLICY "Admins full access on business hours"
  ON public.business_hours FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Grant access
GRANT SELECT ON public.businesses TO anon, authenticated;
GRANT SELECT ON public.business_locations TO anon, authenticated;
GRANT SELECT ON public.business_hours TO anon, authenticated;