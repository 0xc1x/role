-- ============================================
-- FASE 2.7: user_consents, user_preferences, saved_addresses, device_tokens
-- Aligned with ANALYTICS.md (consent) and SYSTEM_ARCHITECTURE.md
-- ============================================

-- ============================================
-- user_consents (analytics consent tracking per ANALYTICS.md)
-- ============================================
CREATE TABLE public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL, -- 'analytics', 'marketing', 'notifications'
  granted BOOLEAN NOT NULL DEFAULT false,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, consent_type)
);

CREATE INDEX idx_user_consents_user ON public.user_consents(user_id);
CREATE INDEX idx_user_consents_type ON public.user_consents(consent_type);

CREATE TRIGGER set_user_consents_updated_at
  BEFORE UPDATE ON public.user_consents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- user_preferences (notification_radius_km, categories, etc.)
-- ============================================
CREATE TABLE public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_radius_km INTEGER DEFAULT 5,
  favorite_categories TEXT[] DEFAULT '{}',
  language TEXT DEFAULT 'es',
  dark_mode BOOLEAN DEFAULT false,
  push_notifications_enabled BOOLEAN DEFAULT true,
  email_notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_preferences_user ON public.user_preferences(user_id);

CREATE TRIGGER set_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================
-- saved_addresses
-- ============================================
CREATE TABLE public.saved_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT NOT NULL, -- 'home', 'work', 'other'
  address TEXT NOT NULL,
  latitude DECIMAL(10,8) NOT NULL,
  longitude DECIMAL(11,8) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_addresses_user ON public.saved_addresses(user_id);

CREATE TRIGGER set_saved_addresses_updated_at
  BEFORE UPDATE ON public.saved_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.saved_addresses ENABLE ROW LEVEL SECURITY;

-- ============================================
-- device_tokens (push notifications)
-- ============================================
CREATE TABLE public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_info JSONB DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(token)
);

CREATE INDEX idx_device_tokens_user ON public.device_tokens(user_id);
CREATE INDEX idx_device_tokens_active ON public.device_tokens(is_active) WHERE is_active = true;

CREATE TRIGGER set_device_tokens_updated_at
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for user_consents
-- ============================================
CREATE POLICY "Users can view own consents"
  ON public.user_consents FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own consents"
  ON public.user_consents FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own consents"
  ON public.user_consents FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all consents"
  ON public.user_consents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS Policies for user_preferences
-- ============================================
CREATE POLICY "Users can view own preferences"
  ON public.user_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================
-- RLS Policies for saved_addresses
-- ============================================
CREATE POLICY "Users can view own addresses"
  ON public.saved_addresses FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own addresses"
  ON public.saved_addresses FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own addresses"
  ON public.saved_addresses FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own addresses"
  ON public.saved_addresses FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- RLS Policies for device_tokens
-- ============================================
CREATE POLICY "Users can view own device tokens"
  ON public.device_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own device tokens"
  ON public.device_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own device tokens"
  ON public.device_tokens FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own device tokens"
  ON public.device_tokens FOR DELETE
  USING (user_id = auth.uid());

-- Grant access
GRANT SELECT ON public.user_consents TO authenticated;
GRANT SELECT ON public.user_preferences TO authenticated;
GRANT SELECT ON public.saved_addresses TO authenticated;
GRANT SELECT ON public.device_tokens TO authenticated;