-- ============================================
-- FASE 2.1: Enums + profiles
-- ============================================

-- App role enum (user, business, admin)
-- guest is NOT persisted — it's a client-side state only
CREATE TYPE public.app_role AS ENUM ('user', 'business', 'admin');

-- Order status enum
CREATE TYPE public.order_status AS ENUM (
  'pending',
  'confirmed',
  'ready_for_pickup',
  'picked_up',
  'completed',
  'cancelled',
  'expired'
);

-- Payment intent status enum
CREATE TYPE public.payment_intent_status AS ENUM (
  'pending',
  'processing',
  'approved',
  'rejected',
  'cancelled',
  'refunded'
);

-- Payment gateway enum
CREATE TYPE public.payment_gateway AS ENUM ('place_to_pay', 'stripe');

-- Payout status enum
CREATE TYPE public.payout_status AS ENUM (
  'pending',
  'processing',
  'paid',
  'failed'
);

-- Coupon type enum
CREATE TYPE public.coupon_type AS ENUM ('percentage', 'fixed');

-- Business type enum
CREATE TYPE public.business_type AS ENUM (
  'restaurant',
  'bakery',
  'cafe',
  'grocery',
  'other'
);

-- Day of week enum for business hours
CREATE TYPE public.day_of_week AS ENUM (
  'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday'
);

-- ============================================
-- profiles: extends auth.users with role
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  role public.app_role NOT NULL DEFAULT 'user',
  city TEXT,
  notification_radius_km INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for role-based queries
CREATE INDEX idx_profiles_role ON public.profiles(role);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Auto-create profile on signup (trigger on auth.users)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: auto-create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- RLS Policies for profiles
-- ============================================
-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile (but NOT role — role changes via admin)
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update all profiles (including role changes)
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Business users can view other business profiles (for directory)
CREATE POLICY "Business can view business profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'business'
    )
  );

-- Grant access to anon and authenticated roles
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;