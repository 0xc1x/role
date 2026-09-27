-- Soft-hide moderation for public.reviews.
--
-- WHY
--
-- public.reviews had no moderation capability at all: no is_hidden, no
-- moderated_at, no moderated_by, no hidden_reason, no moderation_reason, and a
-- SELECT policy named "Anyone can view reviews" with `using (true)`. Reviews are
-- user-facing — the mobile reads them straight from PostgREST — so a rating was
-- unreviewable: a user could post an abusive review and no surface could take it
-- down.
--
-- WHY THE REASONS ARE A DECLARED TAXONOMY, NOT ONLY A FREE-TEXT BOX
--
-- The platform reserves the right to withdraw content that does not comply with
-- its policies, and that includes content that promotes hate. With only a
-- free-text box the reservation is unenforceable in practice: reasons end up as
-- "no me gustó", "malo" o "x", none of which a business can be answered with, and
-- nobody can tell whether two removals were the same decision. So
-- `moderation_reason` carries a token from a declared set
-- (`packages/commons/src/review`, `REVIEW_MODERATION_REASONS`) and
-- `hidden_reason` remains the free-text detail. The token is the appeal record —
-- the answer to "under which policy was this withdrawn" — and the free text is
-- the context around it.
--
-- WHY `moderation_reason` IS `text` AND NOT A POSTGRES ENUM
--
-- This file is applied to the ledger EXACTLY ONCE, PERMANENTLY. A Postgres enum
-- (or a CHECK listing the allowed values) turns the next reason into a new
-- migration plus, for an enum, an ALTER TYPE and a column-type change on a table
-- the mobile reads on every business page. The taxonomy is a product decision
-- that WILL evolve — a reason added for one incident is usually a reason needed
-- for a hundred — and a one-line change in commons, deployed like any other
-- contract, is the whole cost of that evolution.
--
-- So: the column is `text`, the allowed tokens are validated in zod in commons,
-- and the only thing the database enforces about `moderation_reason` is that it
-- is present, is not blank, and is short enough to be a token. Everything else
-- about WHICH values are legal is contract, and contracts are allowed to change
-- in a deploy. What the database does forbid is a hidden review with no reason
-- at all, because a moderation decision with nothing recorded is an appeal
-- record with nothing in it.
--
-- WHY SOFT-HIDE AND NOT DELETE
--
--  - Deleting destroys the evidence of what was hidden and by whom. The business
--    owner can appeal, and without a record there is nobody to answer.
--  - Deleting FREES the UNIQUE(user_id, order_id) constraint, so the same user
--    re-posts the same abusive review seconds later. That is not moderation, it
--    is a delete button. Keeping the row keeps the constraint holding.
--  - Soft-hide is auditable and reversible.
--
-- DEPLOY ORDER — READ THIS BEFORE APPLYING
--
-- This migration MUST be applied to Supabase BEFORE the code that reads or
-- writes these columns is deployed:
--
--   - apps/api  `GET /reviews/moderation` (incl. the `moderation_reason`
--               filter), `PATCH /reviews/:id/hide` —which now REQUIRES a
--               `moderation_reason` token and writes it—, `PATCH
--               /reviews/:id/unhide` and the moderation mapper
--   - apps/admin the moderation view and its reason selector
--
-- The other way round is a 500, not a degraded screen: the API selects
-- reviews.is_hidden and reviews.moderation_reason and those columns do not exist
-- yet. There is no feature flag and no backwards-compatible window — the API and
-- the panel ship AFTER this file is in the ledger.
--
-- STATUS: NOT APPLIED. This file was written and committed — and later AMENDED,
-- before anything ran — without being sent to any database. Per
-- supabase/migrations/README.md it has to go through `apply_migration` (never
-- `execute_sql`, never the dashboard), and then be renamed to the version the
-- SERVER assigned, with `md5sum <file>` proven equal to
-- `md5(statements[1])` for that version. The `20260927...` version in the
-- filename is a placeholder, not a claim about the ledger.
--
-- The amendment matters for that proof: the DDL in the ledger is this file AS
-- COMMITTED, including the `moderation_reason` column and the three constraints
-- that go with it. The md5 only matches if the file is applied in this exact
-- shape. An amendment made AFTER an apply would leave `md5sum` disagreeing with
-- the ledger, and the fix is then an explicit new migration — never a silent
-- edit. Amending is free only while the ledger has no memory of this file, which
-- is the case now.
--
-- ROLLBACK: drop the five columns, drop the four indexes, drop the four
-- constraints, restore "Anyone can view reviews" and re-grant table-level
-- UPDATE. Reviews that were hidden during the period stay hidden=False only if
-- they were unhidden; rows still flagged is_hidden=true become visible again on
-- rollback, which is the one behaviour a rollback cannot preserve. Nothing is
-- deleted — including the recorded tokens: dropping the column discards the
-- declared reason of every moderation already performed, which is why a real
-- rollback of this feature is a decision, not a routine `drop`.

begin;

-- ============================================
-- 1. Moderation columns
-- ============================================
-- is_hidden is NOT NULL DEFAULT false on purpose: it is an ADD COLUMN with a
-- constant default, so Postgres takes the fast path (no table rewrite) and every
-- existing row reads as visible without a backfill.
alter table public.reviews
  add column if not exists is_hidden boolean not null default false,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.profiles (id) on delete set null,
  add column if not exists hidden_reason text,
  add column if not exists moderation_reason text;

comment on column public.reviews.is_hidden is
  'Soft-hide flag. TRUE = withheld from every reader except the author and admins. The row is never deleted, so UNIQUE(user_id, order_id) keeps holding and the author cannot re-post.';
comment on column public.reviews.moderated_at is
  'When the row was last hidden or unhidden. NULL while it has never been moderated.';
comment on column public.reviews.moderated_by is
  'Profile of the admin who last hid or unhid the row. ON DELETE SET NULL: deleting the admin account must not delete the review or the appeal record, it only leaves the name unknown.';
comment on column public.reviews.hidden_reason is
  'Free-text detail about why the operator hid the row. MANDATORY when moderation_reason is ''other'' and optional for every named reason, where the token already states the reason. Survives an unhide on purpose, so the decision to restore a review can be explained later. NULL is legitimate here; only the ''other'' token forbids it.';
comment on column public.reviews.moderation_reason is
  'Machine token of the declared taxonomy of moderation reasons (see REVIEW_MODERATION_REASONS in packages/commons), e.g. insults_hate_speech. text, NOT a Postgres enum, on purpose: the allowed set is product and evolves in a deploy, and this file is applied to the ledger exactly once. NULL only while the row has never been hidden. Survives an unhide, like hidden_reason.';

-- The reason is the appeal record, so " " is not a reason. Enforced in the
-- database as well as in zod, because the API is not the only possible writer.
alter table public.reviews
  add constraint reviews_hidden_reason_length
  check (hidden_reason is null or length(btrim(hidden_reason)) between 1 and 500);

-- A LENGTH bound on the token, and deliberately NOT a list of the legal tokens.
-- Listing them here would be the trap this column exists to avoid: the first
-- reason the product adds would need a new migration. The bound only stops a
-- caller from parking a 500-character paragraph in the column that the queue
-- filters and groups by, which would make that filter meaningless. 100 is far
-- above the longest current token and generous enough for any future one.
alter table public.reviews
  add constraint reviews_moderation_reason_length
  check (
    moderation_reason is null
    or length(btrim(moderation_reason)) between 1 and 100
  );

-- A hidden review MUST say which declared reason applied. Without this the
-- appeal record has a timestamp and an author but not a reason, and the
-- `moderation_reason` index would be full of NULLs an operator cannot act on.
-- `is_hidden is not true` (not `= false`) matches the read policy and the rating
-- triggers: a hypothetical NULL flag is treated as not hidden and so is not
-- forced to carry a reason.
--
-- This is safe to add to a table that already has rows: every existing row reads
-- is_hidden = false from the default set in the ADD COLUMN above, so the check
-- passes without a backfill and without a full scan rewriting anything.
alter table public.reviews
  add constraint reviews_moderation_reason_required
  check (is_hidden is not true or moderation_reason is not null);

-- "other" is the one token that explains nothing on its own, so it is the one
-- that cannot stand alone: naming it without describing the case would produce
-- exactly the unusable appeal record this column set exists to prevent. The
-- length bound is repeated rather than referenced (a CHECK cannot depend on
-- another CHECK) so this constraint holds on its own.
alter table public.reviews
  add constraint reviews_moderation_reason_other_needs_detail
  check (
    moderation_reason is distinct from 'other'
    or (hidden_reason is not null and length(btrim(hidden_reason)) between 1 and 500)
  );

-- ============================================
-- 2. Indexes
-- ============================================
-- Moderation queue: filter by visibility, newest first, and count. Partial, so
-- it stays small no matter how many visible reviews accumulate.
create index if not exists idx_reviews_hidden_created
  on public.reviews (created_at desc)
  where is_hidden = true;

-- The other half of the moderation queue: "las ocultas por insultos", newest
-- first. Leading column is moderation_reason, then created_at desc, so the
-- equality on the reason and the ordering the table already shows are the SAME
-- scan — the same argument as idx_reviews_business_rating below. Partial on
-- is_hidden = true for the same reason as the index above: this filter is only
-- ever asked of hidden rows, and keeping the visible ones out is what keeps the
-- index from growing with every review the platform ever receives.
--
-- It is also the index that makes the taxonomy pay for itself: without it,
-- filtering the queue by reason degrades to a sequential scan of the hidden set
-- plus a sort, which is the first thing that breaks as moderation volume grows.
create index if not exists idx_reviews_hidden_reason_created
  on public.reviews (moderation_reason, created_at desc)
  where is_hidden = true;

-- The public business profile, which is the hot read: the mobile asks PostgREST
-- for one business's reviews ordered by created_at, and separately for the
-- exact count with `head: true`. Partial on is_hidden = false so the index
-- carries only the rows every reader is allowed to see, and so BOTH the list
-- and the count are served by this one index.
create index if not exists idx_reviews_visible_business_created
  on public.reviews (business_id, created_at desc)
  where is_hidden = false;

-- Admin filter "this business, N stars": the moderation queue filter matches a
-- star count against EITHER rating the reviewer gave (product_rating or
-- business_rating), because `rating` itself is legacy and NULL for every modern
-- row. Leading column is business_id so the count and the page of one business
-- are the same scan.
create index if not exists idx_reviews_business_rating
  on public.reviews (business_id, business_rating, product_rating);

-- ============================================
-- 3. The read policy — this is the enforcement point
-- ============================================
-- The panel is not what hides a review from the app: this policy is. The mobile
-- does not go through the API, it queries PostgREST directly, so a policy that
-- still said `using (true)` would make every moderation action a no-op in the
-- product. One policy covers the list AND the head count, because both run
-- through it — there is deliberately no second policy for the count.
drop policy if exists "Anyone can view reviews" on public.reviews;

-- NO `to` clause, matching the policy it replaces: it applied to every role, and
-- narrowing it to `anon, authenticated` would be a silent read regression for
-- any role not named here.
--
-- `is_hidden is not true` instead of `is_hidden = false`, on purpose. The column
-- is NOT NULL so the two are identical today, but `is not true` treats a
-- hypothetical NULL as VISIBLE. That is a deliberate fail-open: the failure mode
-- of the strict form, if the column were ever added without its default, would
-- be every existing review on the platform vanishing from every business page.
--
-- For a row with is_hidden = false this predicate is TRUE unconditionally —
-- byte for byte the same set of readers `using (true)` gave, including anon
-- (auth.uid() is NULL there, which is why the author branch is an OR and not a
-- requirement). For a row with is_hidden = true the only readers left are the
-- author and admins: "Admins can manage all reviews" (FOR ALL, recreated in
-- 20260509231501) still grants admins SELECT, because RLS policies are
-- permissive and OR together.
--
-- The API needs no policy at all: it talks to Postgres with the service role,
-- which bypasses RLS. That is the reason the admin panel can read hidden
-- reviews, and no policy here may block it.
create policy "Anyone can view non-hidden reviews"
  on public.reviews
  for select
  using (is_hidden is not true or user_id = (select auth.uid()));

-- ============================================
-- 4. A client must not be able to write the moderation columns
-- ============================================
-- "Users can update own reviews" (20260507193731) has no WITH CHECK, so Postgres
-- reuses its USING expression — which constrains only user_id. A user editing
-- their own comment could therefore also set is_hidden = false and un-hide a
-- review the platform had just hidden, or forge moderated_by / moderated_at /
-- hidden_reason. RLS decides WHICH row; the grant decides WHICH columns.
--
-- No client UPDATE path exists today (the mobile only reads reviews), so this
-- narrows nothing in use and closes the hole for the next one.
revoke update on public.reviews from anon, authenticated;
grant update (rating, comment, product_rating, business_rating)
  on public.reviews to authenticated;

-- Made explicit instead of relying on Supabase's blanket default privileges,
-- which is what let the hole above exist in the first place.
grant select on public.reviews to anon, authenticated;

-- ============================================
-- 5. A hidden review must leave the public average
-- ============================================
-- Without this, moderation is cosmetic: the row disappears from the business
-- page and stays inside businesses.rating / offers.rating, so the abusive 1-star
-- the operator just removed is still the number the storefront shows. These two
-- functions are the ones live since 20260529201439; they are replaced whole, not
-- patched, so the entire body is here for review. The previous
-- `update_offer_rating` body assigned to `v_offer_id` without declaring it;
-- this one declares what it uses.
--
-- `is_hidden is not true` rather than `= false` for the same fail-open reason as
-- the policy above.
create or replace function public.update_business_rating()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_business_id uuid;
begin
  if tg_op = 'DELETE' then
    v_business_id := old.business_id;
  else
    v_business_id := new.business_id;
  end if;

  update public.businesses
  set
    rating = (
      select coalesce(avg(r.business_rating), 0)
      from public.reviews r
      where r.business_id = v_business_id
        and r.is_hidden is not true
    ),
    review_count = (
      select count(*)
      from public.reviews r
      where r.business_id = v_business_id
        and r.is_hidden is not true
    )
  where id = v_business_id;

  return coalesce(new, old);
end;
$function$;

create or replace function public.update_offer_rating()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_offer_id uuid;
begin
  if tg_op = 'DELETE' then
    select offer_id into v_offer_id from public.orders where id = old.order_id;
  else
    select offer_id into v_offer_id from public.orders where id = new.order_id;
  end if;

  -- The BUSINESS average is not recomputed here: the sibling trigger
  -- `on_review_change` fires the other function on the same AFTER UPDATE, so it
  -- already covers a hide.
  if v_offer_id is not null then
    update public.offers
    set
      rating = (
        select coalesce(avg(r.product_rating), 0)
        from public.reviews r
        join public.orders o on o.id = r.order_id
        where o.offer_id = v_offer_id
          and r.is_hidden is not true
      ),
      review_count = (
        select count(*)
        from public.reviews r
        join public.orders o on o.id = r.order_id
        where o.offer_id = v_offer_id
          and r.is_hidden is not true
      )
    where id = v_offer_id;
  end if;

  return coalesce(new, old);
end;
$function$;

-- No backfill: is_hidden defaults to false, so every existing row is visible and
-- the recompute would write back the values already there. Touching every
-- businesses/offers row to change nothing is a risk, not a safety.

commit;
