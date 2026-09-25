-- ============================================
-- Fix security advisor warnings
-- ============================================

-- ============================================
-- 1. Revoke EXECUTE from anon for SECURITY DEFINER functions
-- These are trigger functions — should NOT be callable via REST API
-- ============================================
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_user_preferences() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_consents() FROM anon, authenticated;

-- reserve_offer SHOULD be callable by authenticated users (it's the reservation endpoint)
-- But NOT by anon (unauthenticated users can't reserve)
REVOKE EXECUTE ON FUNCTION public.reserve_offer(UUID, UUID, UUID) FROM anon;

-- ============================================
-- 2. Fix RLS policies with WITH CHECK (true) — restrict to service_role
-- These tables are written by edge functions (service_role), not by users directly
-- ============================================

-- Drop overly permissive policies
DROP POLICY IF EXISTS "System can insert order events" ON public.order_events;
DROP POLICY IF EXISTS "System can insert payment events" ON public.payment_events;
DROP POLICY IF EXISTS "System can update payment events" ON public.payment_events;
DROP POLICY IF EXISTS "System can insert payment intents" ON public.payment_intents;
DROP POLICY IF EXISTS "System can update payment intents" ON public.payment_intents;
DROP POLICY IF EXISTS "System can insert payouts" ON public.payouts;
DROP POLICY IF EXISTS "System can update payouts" ON public.payouts;

-- Re-create with proper restrictions
-- order_events: only triggers (SECURITY DEFINER) and service_role can insert
-- Authenticated users can't directly insert order_events — they go through order status changes
CREATE POLICY "No direct insert on order_events"
  ON public.order_events FOR INSERT
  WITH CHECK (false); -- Only service_role bypasses RLS

-- payment_events: only webhooks (service_role) can insert/update
CREATE POLICY "No direct insert on payment_events"
  ON public.payment_events FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No direct update on payment_events"
  ON public.payment_events FOR UPDATE
  USING (false);

-- payment_intents: only edge functions (service_role) can insert/update
CREATE POLICY "No direct insert on payment_intents"
  ON public.payment_intents FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No direct update on payment_intents"
  ON public.payment_intents FOR UPDATE
  USING (false);

-- payouts: only system (service_role) can insert/update
CREATE POLICY "No direct insert on payouts"
  ON public.payouts FOR INSERT
  WITH CHECK (false);

CREATE POLICY "No direct update on payouts"
  ON public.payouts FOR UPDATE
  USING (false);

-- ============================================
-- 3. Revoke SELECT from anon for sensitive tables
-- These should only be accessible to authenticated users
-- ============================================
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.orders FROM anon;
REVOKE SELECT ON public.order_events FROM anon;
REVOKE SELECT ON public.favorites FROM anon;
REVOKE SELECT ON public.payment_intents FROM anon;
REVOKE SELECT ON public.payment_events FROM anon;
REVOKE SELECT ON public.payouts FROM anon;
REVOKE SELECT ON public.user_consents FROM anon;
REVOKE SELECT ON public.user_preferences FROM anon;
REVOKE SELECT ON public.saved_addresses FROM anon;
REVOKE SELECT ON public.device_tokens FROM anon;

-- Keep anon SELECT for public-facing tables (guests can browse):
-- businesses, business_locations, business_hours, offers, coupons, reviews
-- These are intentionally public per PRODUCT_BRIEF.md (guests can see offers)