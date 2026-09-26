-- Phase 3 of the businesses column split: RLS rewrite, ownership bootstrap,
-- and the DROP.
--
-- Completes the split started by 20260925225227. After this, public.businesses
-- holds only public data, so the table-level SELECT that PostgREST requires for
-- the offers catalog no longer exposes anything sensitive, and finding P1-2 is
-- closed for real rather than traded away.
--
-- ============================ APPLY ORDER WARNING ============================
-- DO NOT RUN until the phase-2 API is deployed. The running service still reads
-- businesses.owner_id and businesses.commission_rate; dropping the columns
-- before it is replaced breaks offer reservation and order management.
--
-- ROLLBACK: not reversible by re-running. The columns would have to be
-- repopulated from the companion tables, which is a data migration, not a
-- rollback. Take a snapshot first.
-- ===========================================================================

-- WHAT MOVED
--
--   owner_id                    -> business_ownership
--   balance, commission_rate    -> business_finance
--   verification_status, verified_at, verified_by, rejection_reason
--                              -> business_moderation

begin;

-- ── 1. Rewrite the ten functions that read the moved columns ────────────────
--
-- These are rewritten IN PLACE from their own current definition rather than
-- pasted here as a full body. Two reasons.
--
-- First, honesty: reserve_offer, generate_payouts, set_order_status,
-- cancel_order, validate_pickup_code and active_offers_near move money and
-- orders. A migration that retypes their bodies is a migration that can
-- silently change behaviour nobody re-reads. Rewriting only the specific
-- predicate guarantees that every other line of a function that was audited is
-- preserved byte for byte.
--
-- Second, drift detection: each substitution asserts that its pattern is
-- present. If someone has edited one of these functions since this migration
-- was written, the migration fails instead of quietly doing nothing and
-- leaving a function that reads a column that no longer exists.

-- PL/pgSQL cannot declare a nested function inside DECLARE, so the helper is a
-- separate statement. It lives in pg_temp because it exists only for this
-- migration.
create or replace function pg_temp.apply_rewrite(p_name text, p_pairs text[])
returns void language plpgsql as $f$
declare
  v_def text;
  v_new text;
  v_i int;
  v_count int;
begin
  select count(*) into v_count
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = p_name;

  if v_count <> 1 then
    raise exception 'esperaba exactamente 1 overload de public.%, hay %', p_name, v_count;
  end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = p_name;

  v_new := v_def;
  for v_i in 1 .. array_length(p_pairs, 1) / 2 loop
    if position(p_pairs[v_i * 2 - 1] in v_new) = 0 then
      raise exception
        'patron no encontrado en public.%: [%]', p_name, p_pairs[v_i * 2 - 1];
    end if;
    v_new := replace(v_new, p_pairs[v_i * 2 - 1], p_pairs[v_i * 2]);
  end loop;

  execute v_new;
end $f$;

do $rewrite$
declare
  own constant text :=
    'exists (select 1 from public.business_ownership o where o.business_id = b.id and o.owner_id = auth.uid())';
  approved constant text :=
    'exists (select 1 from public.business_moderation m where m.business_id = b.id and m.verification_status = ''approved'')';
  nl constant text := chr(10);
begin
  -- Ownership predicates: three order functions.
  perform pg_temp.apply_rewrite('set_order_status',      array['b.owner_id = auth.uid()', own]);
  perform pg_temp.apply_rewrite('cancel_order',          array['b.owner_id = auth.uid()', own]);
  perform pg_temp.apply_rewrite('validate_pickup_code',  array['b.owner_id = auth.uid()', own]);

  -- reserve_offer reads the commission rate and gates on approval.
  perform pg_temp.apply_rewrite('reserve_offer', array[
    'select commission_rate into v_commission_rate from public.businesses where id=v_offer.business_id;',
    'select commission_rate into v_commission_rate from public.business_finance where business_id=v_offer.business_id;',
    'b.verification_status=''approved''', approved]);

  -- Balance writers. generate_payouts and accrue_order_earnings also mention
  -- commission_rate, but on public.orders, which keeps its own snapshot column.
  perform pg_temp.apply_rewrite('accrue_order_earnings', array[
    'update public.businesses'
      || nl || '    set balance = balance + new.net_amount'
      || nl || '    where id = new.business_id;',
    'update public.business_finance'
      || nl || '    set balance = balance + new.net_amount'
      || nl || '    where business_id = new.business_id;']);

  perform pg_temp.apply_rewrite('generate_payouts', array[
    'update public.businesses b', 'update public.business_finance b',
    'where o.business_id = b.id',   'where o.business_id = b.business_id',
    'where b.id = v_business.business_id;',
    'where b.business_id = v_business.business_id;']);

  -- Approval gate on offers, and the two catalogue readers.
  perform pg_temp.apply_rewrite('enforce_offer_business_availability', array[
    'and b.verification_status = ''approved''',
    'and exists (select 1 from public.business_moderation m
                  where m.business_id = b.id and m.verification_status = ''approved'')']);

  perform pg_temp.apply_rewrite('active_offers_near', array[
    'b.verification_status=''approved''',
    'exists (select 1 from public.business_moderation m
              where m.business_id = b.id and m.verification_status = ''approved'')']);

  perform pg_temp.apply_rewrite('get_platform_stats', array[
    'public.businesses where verification_status=''approved'' and is_active',
    'public.businesses where is_active
       and exists (select 1 from public.business_moderation m
                    where m.business_id = public.businesses.id
                      and m.verification_status = ''approved'')']);

  perform pg_temp.apply_rewrite('get_platform_public_stats', array[
    'public.businesses where verification_status=''approved'' and is_active',
    'public.businesses where is_active
       and exists (select 1 from public.business_moderation m
                    where m.business_id = public.businesses.id
                      and m.verification_status = ''approved'')']);
end $rewrite$;

-- ── 2. Ownership bootstrap ──────────────────────────────────────────────────
--
-- AFTER INSERT, not BEFORE. The companions carry foreign keys to businesses(id)
-- and those are validated immediately, so a BEFORE trigger runs before the
-- parent row exists and fails with 23503. This was found by running the flow,
-- not by reading the code.
--
-- The cost of AFTER is that the INSERT policy can no longer require the
-- ownership row to already exist. That costs nothing in security: the database
-- assigns owner_id from auth.uid(), so "you may only create a business you own"
-- stops being a clause the caller satisfies and becomes something the caller
-- cannot express. The mobile client used to put owner_id in the insert body and
-- rely on RLS to validate it.
--
-- service_role has no auth.uid(), so ownership is left to the API, which writes
-- business_ownership in the same transaction. Finance and moderation are always
-- created, because the API reads businesses INNER JOINed with them and a
-- missing row would read as "business not found".

create or replace function public.bootstrap_business_companions()
returns trigger
language plpgsql security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is not null then
    insert into public.business_ownership (business_id, owner_id)
    values (new.id, (select auth.uid()))
    on conflict (business_id) do update
      set owner_id = excluded.owner_id, updated_at = now();
  end if;

  insert into public.business_finance (business_id)
  values (new.id)
  on conflict (business_id) do nothing;

  insert into public.business_moderation (business_id)
  values (new.id)
  on conflict (business_id) do nothing;

  return new;
end;
$fn$;

drop trigger if exists trg_bootstrap_business_companions on public.businesses;
create trigger trg_bootstrap_business_companions
  after insert on public.businesses
  for each row
  execute function public.bootstrap_business_companions();

-- ── 3. Verification state moves to the moderation companion ────────────────
--
-- sync_business_verification splits in two. A BEFORE trigger on
-- business_moderation sets verified_at, because an AFTER trigger cannot modify
-- NEW. A second AFTER trigger propagates is_active to businesses, which is a
-- different table and therefore a separate statement.
--
-- The two notification triggers also move, because after the DROP nothing
-- updates businesses.verification_status.
--
-- notify_business_pending deliberately STAYS on businesses. If it moved to the
-- companion it would fire from inside the bootstrap's insert, and at that point
-- the business row is not readable yet. It also tolerates a missing moderation
-- row, so it does not depend on AFTER trigger firing order.

create or replace function public.sync_business_verification()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if new.verification_status = 'approved' then
    if old.verification_status is distinct from 'approved' then
      new.verified_at := now();
    end if;
  elsif new.verification_status = 'rejected' then
    if old.verification_status is distinct from 'rejected' then
      new.verified_at := now();
    end if;
  end if;
  return new;
end;
$fn$;

create or replace function public.apply_business_verification_state()
returns trigger
language plpgsql security definer
set search_path = ''
as $fn$
begin
  update public.businesses
     set is_active = (new.verification_status = 'approved')
   where id = new.business_id;
  return new;
end;
$fn$;

drop trigger if exists trg_sync_business_verification on public.businesses;
drop trigger if exists trg_sync_business_verification on public.business_moderation;
drop trigger if exists trg_apply_business_verification_state on public.business_moderation;

create trigger trg_sync_business_verification
  before insert or update of verification_status on public.business_moderation
  for each row
  execute function public.sync_business_verification();

create trigger trg_apply_business_verification_state
  after insert or update on public.business_moderation
  for each row
  execute function public.apply_business_verification_state();

create or replace function public.notify_business_pending()
returns trigger
language plpgsql security definer
set search_path = public
as $fn$
declare
  admin_template_id uuid;
  owner_template_id uuid;
  admin_email text;
  owner_email text;
  v_status text;
begin
  select verification_status into v_status
    from public.business_moderation where business_id = NEW.id;
  if v_status is not null and v_status <> 'pending' then
    return NEW;
  end if;
  -- solo en INSERT con pending
  if TG_OP = 'INSERT' then
    select id into admin_template_id from email_templates where name = 'business-pending-admin' and is_active and deleted_at is null limit 1;
    select id into owner_template_id from email_templates where name = 'business-pending-owner' and is_active and deleted_at is null limit 1;
    -- resolver emails
    select value #>> '{}' into admin_email from app_config where key = 'contact.negocios_email' and active and is_public;
    if admin_email is null or admin_email !~ '@' then admin_email := 'negocios@role.app'; end if;
    select coalesce(NEW.email, u.email) into owner_email
      from public.business_ownership o
      join auth.users u on u.id = o.owner_id
     where o.business_id = NEW.id;

    if admin_template_id is not null then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.id, admin_template_id, admin_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', NEW.name, 'businessType', NEW.type, 'ownerEmail', owner_email, 'phone', coalesce(NEW.phone,''), 'description', coalesce(NEW.description,''), 'adminUrl', 'https://admin.role.app/businesses/' || NEW.id::text));
    end if;
    if owner_template_id is not null and owner_email ~ '@' then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.id, owner_template_id, owner_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', NEW.name));
    end if;
  end if;
  return NEW;
end;
$fn$;

create or replace function public.notify_business_verification()
returns trigger
language plpgsql security definer
set search_path = public
as $fn$
declare
  tmpl_id uuid;
  owner_email text;
  v_name text;
begin
  if OLD.verification_status = NEW.verification_status then
    return NEW;
  end if;

  select b.name, coalesce(b.email, u.email) into v_name, owner_email
    from public.businesses b
    left join public.business_ownership o on o.business_id = b.id
    left join auth.users u on u.id = o.owner_id
   where b.id = NEW.business_id;

  if NEW.verification_status = 'approved' then
    select id into tmpl_id from email_templates where name = 'business-approved' and is_active and deleted_at is null limit 1;
    if tmpl_id is not null and owner_email ~ '@' then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.business_id, tmpl_id, owner_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', v_name, 'appUrl', 'role://'));
    end if;
  elsif NEW.verification_status = 'rejected' then
    select id into tmpl_id from email_templates where name = 'business-rejected' and is_active and deleted_at is null limit 1;
    if tmpl_id is not null and owner_email ~ '@' then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.business_id, tmpl_id, owner_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', v_name, 'rejectionReason', coalesce(NEW.rejection_reason,'No especificado')));
    end if;
  end if;
  return NEW;
end;
$fn$;

drop trigger if exists trg_notify_business_verification on public.businesses;
drop trigger if exists trg_notify_business_verification on public.business_moderation;

create trigger trg_notify_business_verification
  after update of verification_status on public.business_moderation
  for each row
  execute function public.notify_business_verification();

-- 20260926000012 adds a BEFORE INSERT trigger that fills businesses.owner_id
-- from auth.uid(), so a client can create a business without sending an owner.
-- That column is about to disappear, and a trigger referencing it does not fail
-- at migration time: it fails on the next insert, in production, with 42703.
-- bootstrap_business_companions above already derives ownership, so the old
-- trigger is now dead weight that must go.
drop trigger if exists trg_set_business_owner_from_jwt on public.businesses;

-- ── 4. RLS rewrite ──────────────────────────────────────────────────────────
--
-- Twenty policies, not three. Seventeen of them live on OTHER tables and join
-- businesses to decide ownership: offers (4), business_notification_preferences
-- (3), offer_categories (2), business_hours, business_locations, coupons,
-- payouts, orders, order_events, payment_intents and profiles.
--
-- That is why this migration does NOT use DROP COLUMN ... CASCADE. Postgres
-- refuses the drop without it, which is the safe outcome; with it, those
-- seventeen policies would have been deleted silently, and an "Owners can
-- update own offers" policy silently vanishing is an open door, not a warning.
--
-- Each policy below resolves ownership through business_ownership. That is also
-- cheaper than before: business_ownership holds one row per business with a
-- primary key on business_id and an index on owner_id, so each EXISTS replaces
-- a join against the wide public table.

drop policy if exists "Owners can insert own businesses" on public.businesses;
drop policy if exists "Owners can update own businesses" on public.businesses;
drop policy if exists "Owners can view own businesses" on public.businesses;

-- The insert policy no longer checks ownership, because the bootstrap trigger
-- runs AFTER the row exists. Ownership is assigned by the database.
create policy "Authenticated can create businesses"
  on public.businesses
  for insert
  to authenticated
  with check (true);

create policy "Owners can update own businesses"
  on public.businesses
  for update
  to authenticated
  using (
    exists (
      select 1 from public.business_ownership o
      where o.business_id = id and o.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.business_ownership o
      where o.business_id = id and o.owner_id = (select auth.uid())
    )
  );

create policy "Owners can view own businesses"
  on public.businesses
  for select
  to authenticated
  using (
    exists (
      select 1 from public.business_ownership o
      where o.business_id = id and o.owner_id = (select auth.uid())
    )
  );

-- Ownership reached directly through business_id.
drop policy if exists "Owners can manage own business hours" on public.business_hours;
create policy "Owners can manage own business hours"
  on public.business_hours for all to public
  using (exists (select 1 from public.business_ownership o
    where o.business_id = business_hours.business_id
      and o.owner_id = (select auth.uid())));

drop policy if exists "Owners can manage own business locations" on public.business_locations;
create policy "Owners can manage own business locations"
  on public.business_locations for all to public
  using (exists (select 1 from public.business_ownership o
    where o.business_id = business_locations.business_id
      and o.owner_id = (select auth.uid())));

drop policy if exists "Owners can manage own coupons" on public.coupons;
create policy "Owners can manage own coupons"
  on public.coupons for all to public
  using (exists (select 1 from public.business_ownership o
    where o.business_id = coupons.business_id
      and o.owner_id = (select auth.uid())));

drop policy if exists "Business can view own payouts" on public.payouts;
create policy "Business can view own payouts"
  on public.payouts for select to public
  using (exists (select 1 from public.business_ownership o
    where o.business_id = payouts.business_id
      and o.owner_id = (select auth.uid())));

drop policy if exists "Owners can view own offers" on public.offers;
drop policy if exists "Owners can insert own offers" on public.offers;
drop policy if exists "Owners can update own offers" on public.offers;
drop policy if exists "Owners can delete own offers" on public.offers;

create policy "Owners can view own offers"
  on public.offers for select to public
  using (exists (select 1 from public.business_ownership o
    where o.business_id = offers.business_id and o.owner_id = (select auth.uid())));

create policy "Owners can insert own offers"
  on public.offers for insert to public
  with check (exists (select 1 from public.business_ownership o
    where o.business_id = offers.business_id and o.owner_id = (select auth.uid())));

create policy "Owners can update own offers"
  on public.offers for update to public
  using (exists (select 1 from public.business_ownership o
    where o.business_id = offers.business_id and o.owner_id = (select auth.uid())));

create policy "Owners can delete own offers"
  on public.offers for delete to public
  using (exists (select 1 from public.business_ownership o
    where o.business_id = offers.business_id and o.owner_id = (select auth.uid())));

drop policy if exists "Business owners view own notification preferences"
  on public.business_notification_preferences;
drop policy if exists "Business owners insert own notification preferences"
  on public.business_notification_preferences;
drop policy if exists "Business owners update own notification preferences"
  on public.business_notification_preferences;

create policy "Business owners view own notification preferences"
  on public.business_notification_preferences for select to public
  using (business_id in (select business_id from public.business_ownership
    where owner_id = (select auth.uid())));

create policy "Business owners insert own notification preferences"
  on public.business_notification_preferences for insert to public
  with check (business_id in (select business_id from public.business_ownership
    where owner_id = (select auth.uid())));

create policy "Business owners update own notification preferences"
  on public.business_notification_preferences for update to public
  using (business_id in (select business_id from public.business_ownership
    where owner_id = (select auth.uid())));

-- Ownership reached through an offer.
drop policy if exists "Owners can insert offer categories" on public.offer_categories;
drop policy if exists "Owners can delete offer categories" on public.offer_categories;

create policy "Owners can insert offer categories"
  on public.offer_categories for insert to authenticated
  with check (exists (
    select 1 from public.offers o
    join public.business_ownership bo on bo.business_id = o.business_id
    where o.id = offer_categories.offer_id
      and bo.owner_id = (select auth.uid())));

create policy "Owners can delete offer categories"
  on public.offer_categories for delete to authenticated
  using (exists (
    select 1 from public.offers o
    join public.business_ownership bo on bo.business_id = o.business_id
    where o.id = offer_categories.offer_id
      and bo.owner_id = (select auth.uid())));

-- Ownership reached through an order.
drop policy if exists "Business can view own order events" on public.order_events;
create policy "Business can view own order events"
  on public.order_events for select to public
  using (exists (
    select 1 from public.orders o
    join public.business_ownership bo on bo.business_id = o.business_id
    where o.id = order_events.order_id
      and bo.owner_id = (select auth.uid())));

drop policy if exists "Business can view own payment intents" on public.payment_intents;
create policy "Business can view own payment intents"
  on public.payment_intents for select to public
  using (exists (
    select 1 from public.orders o
    join public.business_ownership bo on bo.business_id = o.business_id
    where o.id = payment_intents.order_id
      and bo.owner_id = (select auth.uid())));

drop policy if exists "Businesses can view their order customers" on public.profiles;
create policy "Businesses can view their order customers"
  on public.profiles for select to authenticated
  using (exists (
    select 1 from public.orders o
    join public.business_ownership bo on bo.business_id = o.business_id
    where o.user_id = profiles.id
      and bo.owner_id = (select auth.uid())));

drop policy if exists "Business can view own orders" on public.orders;
create policy "Business can view own orders"
  on public.orders for select to public
  using (exists (select 1 from public.business_ownership o
    where o.business_id = orders.business_id
      and o.owner_id = (select auth.uid())));

-- ── 5. The DROP ─────────────────────────────────────────────────────────────
--
-- No CASCADE. If a policy above was missed, this statement fails and the whole
-- migration rolls back, which is the intended safety property.

alter table public.businesses
  drop column if exists owner_id,
  drop column if exists balance,
  drop column if exists commission_rate,
  drop column if exists verification_status,
  drop column if exists verified_at,
  drop column if exists verified_by,
  drop column if exists rejection_reason;

comment on table public.businesses is
  'Public business profile. Table-level SELECT for anon/authenticated is required by PostgREST relationship resolution, so this table holds ONLY public data. Ownership is business_ownership; money is business_finance; moderation state is business_moderation.';

commit;
