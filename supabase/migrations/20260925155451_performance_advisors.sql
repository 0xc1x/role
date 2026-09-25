-- Evidence-backed performance remediation from the 2026-09-25 Supabase advisors.
-- Development-branch first. Do not apply directly to production.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_businesses_verified_by;
--   DROP INDEX IF EXISTS public.idx_campaigns_created_by;
--   DROP INDEX IF EXISTS public.idx_email_components_created_by;
--   DROP INDEX IF EXISTS public.idx_email_templates_created_by;
--   DROP INDEX IF EXISTS public.idx_email_templates_footer;
--   DROP INDEX IF EXISTS public.idx_email_templates_header;
--   DROP INDEX IF EXISTS public.idx_payment_methods_user;
--   DROP INDEX IF EXISTS public.idx_push_notifications_created_by;
--   DROP INDEX IF EXISTS public.idx_push_notifications_template;
--   DROP INDEX IF EXISTS public.idx_push_sends_user;
--   DROP INDEX IF EXISTS public.idx_push_templates_created_by;
--   DROP INDEX IF EXISTS public.idx_segments_created_by;
-- Policy rollback must restore the previous policy definitions from versioned
-- source; do not guess permissive roles or expressions during an incident.

SET search_path = '';

-- Supabase advisor: unindexed foreign keys. These indexes are narrow and do
-- not alter query results, grants, RLS, or business behavior.
CREATE INDEX IF NOT EXISTS idx_businesses_verified_by
  ON public.businesses (verified_by);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by
  ON public.campaigns (created_by);
CREATE INDEX IF NOT EXISTS idx_email_components_created_by
  ON public.email_components (created_by);
CREATE INDEX IF NOT EXISTS idx_email_templates_created_by
  ON public.email_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_email_templates_footer
  ON public.email_templates (footer_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_header
  ON public.email_templates (header_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user
  ON public.payment_methods (user_id);
CREATE INDEX IF NOT EXISTS idx_push_notifications_created_by
  ON public.push_notifications (created_by);
CREATE INDEX IF NOT EXISTS idx_push_notifications_template
  ON public.push_notifications (template_id);
CREATE INDEX IF NOT EXISTS idx_push_sends_user
  ON public.push_sends (user_id);
CREATE INDEX IF NOT EXISTS idx_push_templates_created_by
  ON public.push_templates (created_by);
CREATE INDEX IF NOT EXISTS idx_segments_created_by
  ON public.segments (created_by);

-- The advisor reported one auth RLS initplan issue. Wrapping auth.uid() in a
-- scalar subquery preserves the predicate and evaluates it once per statement.
DROP POLICY IF EXISTS "Users manage own payment methods" ON public.payment_methods;
CREATE POLICY "Users manage own payment methods"
  ON public.payment_methods
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- These four public-role policies duplicate the authenticated policies for
-- every signed-in user. For anonymous requests auth.uid() is NULL while
-- user_id is NOT NULL, so they grant no rows. Remove only those exact duplicates.
DROP POLICY IF EXISTS "Users can delete own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can insert own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can update own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Users can view own device tokens" ON public.device_tokens;

RESET search_path;
