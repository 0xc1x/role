
-- ============================================================
-- Fix remaining RLS infinite recursion on all tables
-- Replace `EXISTS (SELECT 1 FROM profiles WHERE ... role = 'admin')`
-- with `auth_helpers.my_role() = 'admin'` (SECURITY DEFINER, no recursion)
-- ============================================================

-- ---- business_hours ----
DROP POLICY IF EXISTS "Admins full access on business hours" ON public.business_hours;
CREATE POLICY "Admins full access on business hours"
  ON public.business_hours FOR ALL
  TO authenticated
  USING (auth_helpers.my_role() = 'admin')
  WITH CHECK (auth_helpers.my_role() = 'admin');

-- ---- business_locations ----
DROP POLICY IF EXISTS "Admins full access on business locations" ON public.business_locations;
CREATE POLICY "Admins full access on business locations"
  ON public.business_locations FOR ALL
  TO authenticated
  USING (auth_helpers.my_role() = 'admin')
  WITH CHECK (auth_helpers.my_role() = 'admin');

-- ---- coupons ----
DROP POLICY IF EXISTS "Admins full access on coupons" ON public.coupons;
CREATE POLICY "Admins full access on coupons"
  ON public.coupons FOR ALL
  TO authenticated
  USING (auth_helpers.my_role() = 'admin')
  WITH CHECK (auth_helpers.my_role() = 'admin');

-- ---- favorites ----
DROP POLICY IF EXISTS "Admins can view all favorites" ON public.favorites;
CREATE POLICY "Admins can view all favorites"
  ON public.favorites FOR SELECT
  TO authenticated
  USING (auth_helpers.my_role() = 'admin');

-- ---- order_events ----
DROP POLICY IF EXISTS "Admins can view all order events" ON public.order_events;
CREATE POLICY "Admins can view all order events"
  ON public.order_events FOR SELECT
  TO authenticated
  USING (auth_helpers.my_role() = 'admin');

-- ---- orders ----
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON public.orders;
CREATE POLICY "Admins can view all orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (auth_helpers.my_role() = 'admin');
CREATE POLICY "Admins can update all orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (auth_helpers.my_role() = 'admin');

-- ---- payment_events ----
DROP POLICY IF EXISTS "Admins can view all payment events" ON public.payment_events;
CREATE POLICY "Admins can view all payment events"
  ON public.payment_events FOR SELECT
  TO authenticated
  USING (auth_helpers.my_role() = 'admin');

-- ---- payment_intents ----
DROP POLICY IF EXISTS "Admins can view all payment intents" ON public.payment_intents;
CREATE POLICY "Admins can view all payment intents"
  ON public.payment_intents FOR SELECT
  TO authenticated
  USING (auth_helpers.my_role() = 'admin');

-- ---- payouts ----
DROP POLICY IF EXISTS "Admins can view all payouts" ON public.payouts;
CREATE POLICY "Admins can view all payouts"
  ON public.payouts FOR SELECT
  TO authenticated
  USING (auth_helpers.my_role() = 'admin');

-- ---- reviews ----
DROP POLICY IF EXISTS "Admins can manage all reviews" ON public.reviews;
CREATE POLICY "Admins can manage all reviews"
  ON public.reviews FOR ALL
  TO authenticated
  USING (auth_helpers.my_role() = 'admin')
  WITH CHECK (auth_helpers.my_role() = 'admin');

-- ---- user_consents ----
DROP POLICY IF EXISTS "Admins can view all consents" ON public.user_consents;
CREATE POLICY "Admins can view all consents"
  ON public.user_consents FOR SELECT
  TO authenticated
  USING (auth_helpers.my_role() = 'admin');
