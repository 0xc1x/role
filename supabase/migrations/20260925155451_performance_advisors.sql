-- Evidence-backed performance remediation from the 2026-09-25 Supabase advisors.
set search_path = '';
create index if not exists idx_businesses_verified_by on public.businesses (verified_by);
create index if not exists idx_campaigns_created_by on public.campaigns (created_by);
create index if not exists idx_email_components_created_by on public.email_components (created_by);
create index if not exists idx_email_templates_created_by on public.email_templates (created_by);
create index if not exists idx_email_templates_footer on public.email_templates (footer_id);
create index if not exists idx_email_templates_header on public.email_templates (header_id);
create index if not exists idx_payment_methods_user on public.payment_methods (user_id);
create index if not exists idx_push_notifications_created_by on public.push_notifications (created_by);
create index if not exists idx_push_notifications_template on public.push_notifications (template_id);
create index if not exists idx_push_sends_user on public.push_sends (user_id);
create index if not exists idx_push_templates_created_by on public.push_templates (created_by);
create index if not exists idx_segments_created_by on public.segments (created_by);
drop policy if exists "Users manage own payment methods" on public.payment_methods;
create policy "Users manage own payment methods" on public.payment_methods for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own device tokens" on public.device_tokens;
drop policy if exists "Users can insert own device tokens" on public.device_tokens;
drop policy if exists "Users can update own device tokens" on public.device_tokens;
drop policy if exists "Users can view own device tokens" on public.device_tokens;
reset search_path;