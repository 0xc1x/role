-- ─────────────────────────────────────────────────────────────────────────────
-- Close the three gaps in public.reviews: the INSERT that never checked the
-- order, the moderation columns a client could write, and four policies that
-- are TO public
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Three separate findings, three separate mechanisms, and they are NOT the same
-- severity. Collapsing them into one number is how a reader ends up either
-- panicking about a forged JWT or ignoring a real hole, so the distinction is
-- carried through the whole file.
--
--   #1  INSERT accepted a review for any business   REACHABLE TODAY, anon key
--   #2  moderation columns are insert-writable      REACHABLE TODAY, anon key
--   #3  four policies are TO public                 NOT reachable today; narrowing
--
-- ─── WHAT IS REACHABLE, AND WITH WHAT ────────────────────────────────────────
--
-- #1 AND #2 NEED NOTHING BUT THE PUBLIC ANON KEY.
--
-- The anon key ships inside the mobile bundle and inside the landing page. A
-- script that has it can hold a legitimate user JWT — signing up is free and
-- requires no operator action — and then insert whatever it likes. Neither
-- finding needs a forged `sub`, a leaked secret or a privileged role. These two
-- are the reason this file exists.
--
-- #3 NEEDS THE JWT SIGNING SECRET, SO IT IS NOT REACHABLE TODAY.
--
-- The four `TO public` policies are currently denied to `anon` by a
-- three-valued-logic coincidence, not by design: `auth.uid()` is NULL for an
-- anonymous request, `user_id = NULL` evaluates to NULL rather than false, and
-- a NULL `WITH CHECK`/`USING` is treated as not satisfied. Give the same anon
-- session a `sub` claim and all four are satisfied. Forging a `sub` requires
-- the JWT secret, so the practical exposure is zero today.
--
-- It is still worth narrowing, and the reason is not the exposure — it is that
-- the current denial is an accident of NULL arithmetic that nobody wrote down
-- and that the next person to read the policy will misread. `TO authenticated`
-- says who the policy is for. It costs nothing and it is not a regression.
--
-- ─── #1: THE INSERT NEVER CHECKED THE ORDER. THIS IS THE SEVERE ONE. ────────
--
-- `Users can insert own reviews` was `WITH CHECK (user_id = auth.uid())`. That
-- is the entire check. It does not ask whether `order_id` belongs to the caller,
-- and it does not ask whether `business_id` is the business of that order — so
-- "you may only review a place you went to" was not expressed anywhere in the
-- database. Not in a policy, not in a CHECK constraint, not in a trigger.
--
-- It is cheap to exploit, which is what makes it severe rather than theoretical.
-- `reviews_user_id_order_id_key` is `UNIQUE (user_id, order_id)`, `order_id` is
-- NULLABLE, and a UNIQUE constraint does not treat NULLs as equal to each other.
-- So a consumer can insert unlimited reviews against ANY business by leaving
-- `order_id` NULL, and every one of them is a distinct row. Measured on the
-- harness before this migration: two rows, zero distinct orders, on a business
-- the consumer had no relationship with, both public immediately, and the
-- business's `review_count` moved to 2 with its average dragged to 0.00.
--
-- The fix closes both halves at once: `order_id is not null`, plus an `EXISTS`
-- that requires the order to be the caller's own AND to belong to the
-- `business_id` being reviewed. Either half alone leaves a hole — without the
-- first, `EXISTS` is trivially false and the row is refused for the wrong
-- reason; without the second, a consumer can review a real business through an
-- order of a DIFFERENT business.
--
-- ─── WHY THIS DOES NOT BREAK THE PRODUCT: THE ORDER IS MANDATORY ─────────────
--
-- A `NOT NULL`-by-policy is only safe if no real client sends NULL. Both write
-- paths were measured, and both supply an order:
--
--   - The mobile, which does not go through the API and writes straight to
--     PostgREST: `apps/mobile/src/features/orders/data/repository.ts`
--     `submitReview` declares `orderId: string` — required, not optional — and
--     calls `currentUserId()` first, throwing `Errors.unauthorized` when there
--     is no session, so an anonymous write is impossible on that path too. Its
--     only caller, `apps/mobile/app/review-order/[id].tsx`, takes the id from
--     the route and refuses to render without the loaded order, then passes
--     `orderId: data.order.id` AND `businessId: data.order.business_id` — read
--     off the SAME order row. A client that satisfies this policy is exactly a
--     client that behaves like this one.
--   - The API, `ReviewsService.create`, which is stricter still: it loads the
--     order, refuses it if `order.user_id !== user.id`, refuses it unless
--     `status = 'completed'`, and then writes `business_id: order.business_id`
--     rather than anything the caller sent.
--
-- So the new `EXISTS` describes the shape every legitimate write already has.
-- It does not narrow a flow that exists; it removes a shape that only an attacker
-- was producing.
--
-- The one divergence this file does NOT close, on purpose: the API requires
-- `status = 'completed'` and the mobile does not check status at all — it writes
-- through PostgREST, and the database has never expressed the rule. Adding it
-- here would be a product decision (reviews on a `confirmed` order) taken inside
-- a security migration, and the mobile's review screen is reachable from an
-- order detail page regardless of status. It is reported, not silently adopted.
--
-- ─── `order_id IS NOT NULL` IS REDUNDANT, AND IS HERE ANYWAY ─────────────────
--
-- Measured, and stated because a clause that does no work must not be described
-- as if it did: the `EXISTS` below already refuses a NULL `order_id`, because
-- `o.id = NULL` is never true. The mutation suite says so precisely: deleting
-- the `IS NOT NULL` term leaves every BEHAVIOURAL test in
-- `profiles-reviews.rls.db.spec.ts` green. The single assertion that notices is
-- a `toContain` on the catalog text, in the test that reads the policy out of
-- `pg_policies` — which is a text guard, not evidence that the term stops
-- anything. Anyone reading this as "the NOT NULL is what stops the NULL insert"
-- is reading it wrong, and the difference is not academic on this table: an
-- accident of NULL comparison is exactly what made the four `TO public`
-- policies look defended.
--
-- It stays anyway, for the reason the rest of this ledger argues for in the
-- opposite direction: the invariant is written where a reader looks for it. A
-- future edit that loosens the EXISTS — to a join, or to "the caller has some
-- order", which is a real mutation the suite DOES catch — must not silently
-- re-open the NULL path, and a term that states the rule is what makes that
-- edit a deliberate act rather than an oversight. The cost is one clause that
-- does no work plus one assertion guarding it; the alternative is a policy
-- whose only NULL defence is a side effect of the subquery.
--
-- Note also that `reviews.order_id` really does hold NULLs in production: the
-- foreign key is `ON DELETE SET NULL`, so deleting an order nulls it on rows
-- written years ago. RLS is not retroactive and this file does not touch those
-- rows; it only stops new ones, and a legacy row is asserted to survive in the
-- spec.
--
-- ─── #2: A CLIENT COULD WRITE THE MODERATION COLUMNS ─────────────────────────
--
-- `is_hidden`, `moderated_at`, `moderated_by`, `moderation_reason` and
-- `hidden_reason` are all inside the INSERT grant, and nothing overwrote them.
-- The two triggers on this table are `AFTER INSERT OR DELETE OR UPDATE` and
-- their entire bodies are an `UPDATE` on `businesses` and on `offers`: they
-- derive the AGGREGATE from a review, they never write back to `reviews`. So a
-- signed-in consumer could insert a review that arrived already moderated.
--
-- WHAT IS ALREADY CLOSED, and is NOT re-closed here, because re-closing it in a
-- policy would be duplicating a defence that is real:
--
--   - `reviews_moderation_reason_required`
--     (`is_hidden IS NOT TRUE OR moderation_reason IS NOT NULL`) means a
--     client-supplied hide has to carry a reason. It constrains WHAT, never
--     WHO.
--   - There is no UPDATE privilege for any client role on these columns, so a
--     client cannot un-hide a review. The escalation that actually mattered was
--     always the one in the other direction, and it is closed.
--
-- WHAT IS STILL OPEN, and what this file closes: a client can create a row that
-- presents as moderated and attributes it to ANY existing profile, because
-- `moderated_by` is a foreign key to `profiles(id)` and not to an admin role.
-- That is a falseable audit trail. It is also, measured, the way to take a
-- review OUT of the moderation inbox: the inbox filters on `is_hidden`
-- (`moderationWhere` in `reviews.repository.ts` maps `hidden`/`visible` to
-- `is_hidden = true/false` — it does NOT filter on `moderated_by IS NULL`, so
-- that specific fear is unfounded and is recorded as unfounded), and a client
-- that inserts with `is_hidden = true` also removes its own row from the public
-- feed and from the business average, because both exclude `is_hidden is not
-- true`. A 1-star review that deletes itself on arrival is worse than a forged
-- signature, and both come from the same write.
--
-- The fix is a `BEFORE INSERT` trigger that resets all five columns, which is
-- the pattern this ledger already uses for exactly this class of problem:
-- `trg_default_business_inactive` forces `is_active := false` on INSERT so a
-- client cannot conjure an approved business out of thin air.
--
-- WHY A TRIGGER AND NOT A COLUMN GRANT, stated as the rule rather than the
-- preference: a GRANT is a convention that a routine migration can undo, and
-- this ledger has the receipt — `20260925163235` revoked everything on
-- `businesses` and `20260925224820` put table-wide SELECT back twenty minutes
-- later, for a documented reason. A trigger is a statement about the data that
-- survives being re-granted, because it is not consulted about privileges at
-- all. `20260928161526` reaches the same conclusion for the same reason.
--
-- The trigger is ROLE-AGNOSTIC, and that is deliberate: it does not ask who the
-- caller is, so it needs no `auth_helpers.my_role()` call, no extra privilege
-- and no second role to keep in sync. That is sound here because no legitimate
-- writer ever inserts a hidden review — moderation is an UPDATE, and always has
-- been (`ReviewsModerationService.hide`/`unhide` both route to
-- `ReviewsRepository.setHidden`, an UPDATE). A new review starts visible; hiding
-- it is a second, deliberate, attributable act. The function is SECURITY
-- INVOKER and reads no table, so the narrowest possible body is also the one
-- that is here.
--
-- One consequence to be honest about: this applies to `service_role` too. An
-- operator who wants a review to land hidden must insert it and then UPDATE it,
-- which is the same two steps the API already takes, and the review is
-- attributable to the account that did the second one. That is the point.
--
-- ─── #3: FOUR POLICIES ARE `TO public` ──────────────────────────────────────
--
-- Three of them are narrowed to `TO authenticated`; the SELECT one is not, and
-- the difference is reasoned rather than forgotten:
--
--   - INSERT, UPDATE, DELETE → `TO authenticated`. Each is a write, each names
--     a signed-in author, and none of them has a branch that is meaningful for
--     an anonymous caller. The observable behaviour for `anon` is unchanged for
--     a no-claim request — the statement is still refused, and the INSERT still
--     raises `42501` — and it changes for a request that carries a `sub`, which
--     is exactly the forging case that needed the JWT secret.
--   - SELECT stays `TO public`. Two reasons, and the first one is a decision
--     already on the record: `20260927021015` dropped its `to` clause
--     deliberately, writing that narrowing it to `anon, authenticated` "would be
--     a silent read regression for any role not named here". Reversing a
--     documented choice is not this migration's job, and this migration has no
--     read surface to fix. The second is product: the policy's first branch,
--     `is_hidden IS NOT TRUE`, is the public review feed, and it is consumed by
--     `GET /businesses/public/:id/reviews` (`@Public()`, no token) and
--     `GET /offers/:id/reviews` (`@Public()`). Narrowing this one to
--     `authenticated` would delete the public review feed, and that is a product
--     change disguised as a security fix.
--
-- ─── WHAT LAYER CATCHES WHAT, SO THE SENTENCE IS TRUE TOMORROW ───────────────
--
-- "A client cannot do X" is the same sentence whether the grant, the policy,
-- the CHECK or the trigger caught it, and only one of those will still be true
-- after the next migration. Named explicitly:
--
--   insert with a NULL order_id     → RLS policy WITH CHECK (`order_id is not null`)
--   insert on somebody else's order → RLS policy WITH CHECK (the EXISTS)
--   insert naming the wrong business → RLS policy WITH CHECK (the EXISTS, business half)
--   insert pre-moderated            → BEFORE INSERT trigger
--   un-hide a review                → nothing here: the absence of an UPDATE
--                                     privilege on those columns, unchanged
--   an admin hides a review         → nothing here: an UPDATE, deliberately untouched
--
-- The last two are the ones a reader should not expect this file to have
-- changed. It did not.
--
-- ─── NO-OP ON EXISTING DATA ─────────────────────────────────────────────────
--
-- RLS is evaluated at write time and never retroactively, and this file contains
-- no INSERT/UPDATE/DELETE. Rows written before it keep whatever they hold: a
-- legacy review with a NULL `order_id` stays readable, stays in its business's
-- aggregate and stays deletable by its author. What changes is that nobody can
-- ADD one. `apps/api/src/database/security/profiles-reviews.rls.db.spec.ts`
-- asserts that on a row planted the way a pre-migration row would look, so the
-- claim is measured rather than argued.

begin;

-- ============================================
-- 1. The INSERT policy: the order is the gate
-- ============================================
--
-- `user_id` is compared against the ROW rather than against `auth.uid()` a
-- second time. The two are the same expression by the time the EXISTS runs, and
-- writing it once means the check cannot drift away from the predicate that
-- made the row eligible in the first place.
--
-- A subquery in a policy is evaluated as the invoking user, so this EXISTS is
-- also filtered by the SELECT policies on `orders`. That is why the happy path
-- works: `Users can view own orders` is `user_id = auth.uid()`, so a consumer
-- can see the very order it is trying to review. It is also a coupling worth
-- naming — narrowing the `orders` SELECT policies to something that excludes a
-- consumer's own order would make this INSERT policy refuse legitimate reviews.
-- The coupling is accepted rather than engineered around: a SECURITY DEFINER
-- helper would remove it, and would add a function that reads a table on behalf
-- of anyone, which is a larger thing to review than the problem it solves.

drop policy if exists "Users can insert own reviews" on public.reviews;

create policy "Users can insert own reviews"
  on public.reviews
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and order_id is not null
    and exists (
      select 1
      from public.orders o
      where o.id = reviews.order_id
        and o.user_id = reviews.user_id
        and o.business_id = reviews.business_id
    )
  );

comment on policy "Users can insert own reviews" on public.reviews is
  'A signed-in consumer may post exactly one review per order it placed, and only about the business that order belongs to. order_id is required even though the column is nullable, because UNIQUE (user_id, order_id) does not treat NULLs as equal and a NULL order_id was therefore an unlimited-review primitive against any business.';

-- ============================================
-- 2. The write policies, narrowed to the role they were written for
-- ============================================
--
-- Same predicates, byte for byte. Only the `to` clause changes, and it changes
-- in the direction the predicate always assumed.
--
-- The UPDATE policy is NOT dead code and this is worth being precise about:
-- `authenticated` holds no table-level UPDATE but does hold a COLUMN grant on
-- four columns, so an `update ... set comment = ...` reaches this policy today.
-- `anon` holds no UPDATE privilege of either kind, so narrowing this policy
-- changes nothing observable for it — and changes the answer for a request
-- carrying a forged `sub`.
drop policy if exists "Users can update own reviews" on public.reviews;

create policy "Users can update own reviews"
  on public.reviews
  for update
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can delete own reviews" on public.reviews;

create policy "Users can delete own reviews"
  on public.reviews
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- The SELECT policy is deliberately left `TO public`. `20260927021015` dropped
-- its `to` clause on purpose and recorded why, its first branch
-- (`is_hidden IS NOT TRUE`) is the public review feed behind two `@Public()`
-- routes, and this migration has no read finding to fix. Re-creating it here
-- would be a no-op statement that looks like a decision.

-- ============================================
-- 3. A new review starts unmoderated
-- ============================================
--
-- All five columns, not just `is_hidden`. Resetting only the flag would leave a
-- row claiming it was hidden by an account that never saw it, which is the same
-- falseable trail with one field repaired.
--
-- The `is_hidden := false` half is what stops a consumer from inserting its own
-- review straight into the hidden state, where it would leave the public feed
-- and the business average without ever being visible to a moderator.
--
-- SECURITY INVOKER, explicitly: this function reads no table and writes no
-- other table, so the only thing it needs to do is edit the row it was handed.
-- Stating the invoker rather than leaving it to the default makes the answer to
-- "what can this function do on its own" a property of the definition instead of
-- a property of the reader's memory of a default.
create or replace function public.default_reviews_unmoderated_on_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  new.is_hidden := false;
  new.moderated_at := null;
  new.moderated_by := null;
  new.moderation_reason := null;
  new.hidden_reason := null;
  return new;
end;
$fn$;

comment on function public.default_reviews_unmoderated_on_insert() is
  'BEFORE INSERT on public.reviews. A review is created by its author and moderated by an operator afterwards, so a row that arrives already carrying moderation state is asserting something no operator did. Not role-conditional on purpose: no legitimate writer inserts a hidden review, and asking "who is calling" here would mean calling auth_helpers.my_role() from a trigger and coupling this to profiles.';

drop trigger if exists trg_reviews_unmoderated_on_insert on public.reviews;

create trigger trg_reviews_unmoderated_on_insert
  before insert on public.reviews
  for each row
  execute function public.default_reviews_unmoderated_on_insert();

commit;
