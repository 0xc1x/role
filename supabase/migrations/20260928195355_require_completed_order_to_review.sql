-- ─────────────────────────────────────────────────────────────────────────────
-- A review requires a COMPLETED order, not merely one that exists
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The previous migration made the order the gate: the INSERT's `EXISTS`
-- requires `o.id = reviews.order_id AND o.user_id = reviews.user_id AND
-- o.business_id = reviews.business_id`. That closed the unlimited-review
-- primitive and nothing else. It did not check the order had actually been
-- fulfilled, so a `pending` or `confirmed` order was a valid thing to review.
--
-- ─── WHY THIS WAS OPEN, AND IT WAS NOT AN OVERSIGHT ─────────────────────────
--
-- The two write paths disagreed, and neither was wrong about itself:
--
--   - `ReviewsService.create` (the API) loads the order, checks ownership, and
--     refuses unless `status = 'completed'`.
--   - The mobile writes straight to PostgREST and checked nothing at all, and
--     its review screen is reachable from an order detail page in any status.
--
-- So the rule existed on one path and not the other, and the path without it is
-- the one holding the public anon key. That is the definition of a bypass, and it
-- is the same shape as the INSERT gap: the database expressed no opinion, so
-- whichever client checked won.
--
-- ─── WHY `completed` AND NOT `picked_up` ────────────────────────────────────
--
-- `public.order_status` has seven values and the interesting one to ask about
-- is `picked_up`, which sits between `ready_for_pickup` and `completed` in the
-- enum. It is DEAD:
--
--   - `20260615195645` defines `validate_pickup_code` and it sets
--     `status = 'completed'` directly. That is the code path that records a
--     validated pickup, so `completed` IS the pickup evidence.
--   - `20260906081534` documents in its own header that `picked_up` and
--     `completed` both go through `validate_pickup_code` and the pickup code is
--     mandatory, i.e. `set_order_status` is not the way to reach it.
--   - Production holds one order in `picked_up`, id `f0000000-…-000000000003`,
--     created 2026-05-07: seed data from before the state machine existed, and
--     it carries the platform's only review on a non-completed order.
--
-- So the state that means "this customer collected their food" is `completed`,
-- and there is no path that produces `picked_up`. Including it in a security
-- predicate would be including a value nothing can create, which is a rule that
-- looks careful and is not.
--
-- The dead enum value is worth its own note rather than a fix here: an
-- unreachable state in an ordering type is a place where a future developer can
-- believe a transition is allowed. Removing it from the enum is a product
-- decision about historical data, and this migration does not touch types.
--
-- ─── WHAT THIS COSTS, MEASURED ─────────────────────────────────────────────
--
-- A customer whose order is stuck in `ready_for_pickup` — because the business
-- never validated the pickup — cannot review. That is the intended direction: the
-- pickup code is the evidence, and without it there is nothing to attest to.
-- Production today: zero orders in `ready_for_pickup`, one in `picked_up` (the
-- seed above), seven `completed`. So this closes a gap for a state nobody is in.
--
-- ─── NO-OP ON EXISTING DATA ─────────────────────────────────────────────────
--
-- RLS is evaluated at write time. No INSERT/UPDATE/DELETE appears in this file,
-- and the previous one already refused new NULL-order rows. The seeded review on
-- the `picked_up` order stays exactly where it is; a legacy row is asserted to
-- survive in `profiles-reviews.rls.db.spec.ts` rather than being argued about.
--
-- ─── WHAT LAYER CATCHES WHAT ────────────────────────────────────────────────
--
--   review a pending or confirmed order → RLS policy WITH CHECK (the EXISTS)
--   review without an order at all       → RLS policy WITH CHECK (previous file)
--   review someone else's order          → RLS policy WITH CHECK (previous file)
--   pre-moderated review                 → BEFORE INSERT trigger (previous file)
--
-- The API's own check is deliberately left in place. It is not redundant: it
-- rejects with a product-shaped error before the database is ever consulted, and
-- a client that gets a 422 naming the status is better served than one that gets
-- a policy violation naming a subquery.

begin;

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
        and o.status = 'completed'
    )
  );

comment on policy "Users can insert own reviews" on public.reviews is
  'A signed-in consumer may post exactly one review per order it placed, about the business that order belongs to, and only once that order was actually fulfilled. order_id is required even though the column is nullable, because UNIQUE (user_id, order_id) does not treat NULLs as equal and a NULL order_id was therefore an unlimited-review primitive against any business. status = ''completed'' is the pickup evidence: validate_pickup_code sets it, and no code path produces the picked_up value that sits between ready_for_pickup and completed in the enum.';

commit;
