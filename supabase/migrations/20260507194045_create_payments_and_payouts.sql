-- ============================================
-- FASE 2.6: payment_intents, payment_events, payouts
-- Schema aligned with docs/ai/PAYMENTS.md
-- ============================================

-- ============================================
-- payment_intents
-- ============================================
CREATE TABLE public.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  gateway public.payment_gateway NOT NULL DEFAULT 'place_to_pay',
  gateway_id TEXT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'COP',
  status public.payment_intent_status NOT NULL DEFAULT 'pending',
  gateway_response JSONB DEFAULT '{}',
  idempotency_key UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_intents_order ON public.payment_intents(order_id);
CREATE INDEX idx_payment_intents_gateway_id ON public.payment_intents(gateway_id) WHERE gateway_id IS NOT NULL;
CREATE INDEX idx_payment_intents_status ON public.payment_intents(status);
CREATE INDEX idx_payment_intents_idempotency ON public.payment_intents(idempotency_key);

CREATE TRIGGER set_payment_intents_updated_at
  BEFORE UPDATE ON public.payment_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

-- ============================================
-- payment_events (webhook log)
-- ============================================
CREATE TABLE public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_intent_id UUID NOT NULL REFERENCES public.payment_intents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  gateway_event_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}',
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_events_intent ON public.payment_events(payment_intent_id);
CREATE INDEX idx_payment_events_type ON public.payment_events(event_type);
CREATE INDEX idx_payment_events_processed ON public.payment_events(processed) WHERE processed = false;
CREATE INDEX idx_payment_events_gateway_id ON public.payment_events(gateway_event_id) WHERE gateway_event_id IS NOT NULL;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- ============================================
-- payouts (aligned with PAYMENTS.md schema)
-- ============================================
CREATE TABLE public.payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL CHECK (gross_amount >= 0),
  platform_fee NUMERIC(12,2) NOT NULL CHECK (platform_fee >= 0),
  net_amount NUMERIC(12,2) NOT NULL CHECK (net_amount >= 0),
  status public.payout_status NOT NULL DEFAULT 'pending',
  gateway_payout_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payout_period_valid CHECK (period_end >= period_start),
  CONSTRAINT net_amount_consistent CHECK (net_amount = gross_amount - platform_fee)
);

CREATE INDEX idx_payouts_business ON public.payouts(business_id);
CREATE INDEX idx_payouts_status ON public.payouts(status);
CREATE INDEX idx_payouts_period ON public.payouts(period_start, period_end);

CREATE TRIGGER set_payouts_updated_at
  BEFORE UPDATE ON public.payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for payment_intents
-- ============================================
-- Users can view their own payment intents
CREATE POLICY "Users can view own payment intents"
  ON public.payment_intents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = order_id AND user_id = auth.uid()
    )
  );

-- Business owners can view payment intents for their orders
CREATE POLICY "Business can view own payment intents"
  ON public.payment_intents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.businesses b ON b.id = o.business_id
      WHERE o.id = order_id AND b.owner_id = auth.uid()
    )
  );

-- System can insert payment intents (edge functions)
CREATE POLICY "System can insert payment intents"
  ON public.payment_intents FOR INSERT
  WITH CHECK (true);

-- System can update payment intents (edge functions / webhooks)
CREATE POLICY "System can update payment intents"
  ON public.payment_intents FOR UPDATE
  USING (true);

-- Admins can view all payment intents
CREATE POLICY "Admins can view all payment intents"
  ON public.payment_intents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- RLS Policies for payment_events
-- ============================================
-- System can insert payment events (webhooks)
CREATE POLICY "System can insert payment events"
  ON public.payment_events FOR INSERT
  WITH CHECK (true);

-- Admins can view all payment events
CREATE POLICY "Admins can view all payment events"
  ON public.payment_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- System can update payment events (mark as processed)
CREATE POLICY "System can update payment events"
  ON public.payment_events FOR UPDATE
  USING (true);

-- ============================================
-- RLS Policies for payouts
-- ============================================
-- Business owners can view their own payouts
CREATE POLICY "Business can view own payouts"
  ON public.payouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.businesses
      WHERE id = business_id AND owner_id = auth.uid()
    )
  );

-- Admins can view all payouts
CREATE POLICY "Admins can view all payouts"
  ON public.payouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- System can insert/update payouts (edge functions)
CREATE POLICY "System can insert payouts"
  ON public.payouts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update payouts"
  ON public.payouts FOR UPDATE
  USING (true);

-- Grant access
GRANT SELECT ON public.payment_intents TO authenticated;
GRANT SELECT ON public.payouts TO authenticated;