
-- ============================================================
-- Fix remaining Supabase Advisors
-- ============================================================

-- 1. UNINDEXED FOREIGN KEYS (performance warnings)
CREATE INDEX IF NOT EXISTS idx_order_events_changed_by
  ON public.order_events (changed_by);

CREATE INDEX IF NOT EXISTS idx_orders_coupon_id
  ON public.orders (coupon_id);

-- 2. auth_helpers.my_role search_path should be '' not 'public'
--    (security: prevents search_path injection)
CREATE OR REPLACE FUNCTION auth_helpers.my_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
  UNION ALL
  SELECT 'user'::public.app_role
  LIMIT 1;
$$;
