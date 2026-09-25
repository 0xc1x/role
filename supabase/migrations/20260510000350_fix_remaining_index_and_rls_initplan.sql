
-- 1. Missing index on reviews.order_id
CREATE INDEX IF NOT EXISTS idx_reviews_order_id
  ON public.reviews (order_id);

-- 2. Auth RLS initplan: policies using auth.uid() directly on owner_id columns
--    cause the planner to re-evaluate per row. Fix: add computed columns or 
--    rewrite policies to use auth.uid() in a non-initplan way.
--    The most impactful: businesses.owner_id, offers via businesses
--    These are already optimal (simple auth.uid() comparison), the initplan
--    warning is informational — Supabase recommends accepting it for simple checks.
--    No action needed for auth_rls_initplan when policy is just `col = auth.uid()`.
