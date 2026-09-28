-- Make the public business catalog require moderation approval, and make the
-- database enforce it instead of a column grant convention.
--
-- STATUS: NOT APPLIED TO PRODUCTION. This file is committed for review; the
-- operator applies it through `apply_migration` as a separate, deliberate step.
--
-- ─── What this changes ─────────────────────────────────────────────────────
--
-- One policy. "Anyone can view active businesses" is currently:
--
--     using (is_active = true)
--
-- and that is the whole predicate. It becomes:
--
--     using (is_active = true and public.business_is_approved(businesses.id))
--
-- ─── Why the catalog needed a second layer, and where the first one was ─────
--
-- 1. THE POLICY SAID NOTHING ABOUT MODERATION.
--    `is_active` is a derived copy. `trg_sync_business_verification` writes it
--    from `verification_status`, so the source of truth is the status and the
--    column is a projection of it. The catalog read the projection, which is
--    exactly the column a client can reach by the side door below. A policy
--    that reads a derived copy is a policy that trusts whoever can write the
--    derivation.
--
-- 2. A COLUMN GRANT WAS THE ONLY BOUNDARY.
--    The reason an unapproved business does not appear today is that
--    `is_active` is absent from the client write grants in
--    20260926010336_businesses_client_write_grants.sql. That is a convention,
--    not a boundary, and it fails in three separate ways:
--      - it lives in information_schema.column_privileges, so `has_table_privilege`
--        reports false and a reader inspecting the table sees nothing there;
--      - grants get restored. This ledger has done it once already:
--        20260925163235 revoked everything on `businesses` and
--        20260925224820 put table-wide SELECT back twenty minutes later, for a
--        documented reason. A defence that a routine migration can undo is not
--        a defence;
--      - it protects a COLUMN, while the invariant to protect is a ROW. It only
--        works because nothing else on the row happens to reach the catalog.
--
-- 3. THE TRIGGER AMPLIFIES RATHER THAN BLOCKS.
--    `trg_sync_business_verification` is `BEFORE INSERT OR UPDATE OF
--    verification_status`, so an UPDATE that touches only `is_active` never
--    fires it, and one that sets `verification_status` fires it and gets
--    `is_active` derived. On INSERT, `trg_default_business_inactive` runs
--    first by name order and the derive trigger wins, so a body carrying
--    `verification_status = 'approved'` lands ACTIVE. The trigger is the
--    propagation mechanism that makes moderation work for the API; it has no
--    idea who is asking.
--
-- ─── Why business_moderation, and not businesses.verification_status ───────
--
-- `verification_status` is not on `public.businesses` in production — phase 3
-- (20260927025753) moved it, along with six other columns, onto the three
-- companion tables. The source lives on `public.business_moderation`, keyed by
-- `business_id`, and no client role holds a single privilege on it. That
-- matters here for a second reason beyond reachability: the table is unreadable
-- to every client role BY GRANT, not by policy, so a policy that consults it
-- cannot be satisfied by re-granting something and quietly reading a filtered
-- view of it.
--
-- The gate therefore reads the source. `is_active` stays in the predicate on
-- purpose: it keeps the existing semantics (a business can be deactivated
-- without losing its approval, and deactivation is an operator action) and it
-- makes the policy read as two independent conditions — `is_active` is the
-- curtain, moderation status is the lock.
--
-- ─── WHY A SECURITY DEFINER HELPER, AND NOT AN INLINE EXISTS ───────────────
--
-- The obvious spelling is a subquery in the policy:
--
--     using (is_active = true and exists (
--       select 1 from public.business_moderation bm
--       where bm.business_id = businesses.id
--         and bm.verification_status = 'approved'))
--
-- MEASURED: it does not work, and it fails much wider than expected. An RLS
-- policy's qual is evaluated as the querying role, and the subquery is planned
-- and permission-checked at executor startup — before any row is examined, and
-- regardless of which branch of the ORed policy set finally decides the row.
-- So the inline form returns, for every client role:
--
--     ERROR  42501  permission denied for table business_moderation
--
-- and it does so for `anon`, for a signed-in member, for an admin and for a
-- business owner alike. CREATE POLICY itself succeeds, which is what makes this
-- shape dangerous: the ledger replays green and the breakage only appears on the
-- first client read. The whole table becomes unreadable to every client role,
-- including the admin panel — an RLS hardening that breaks the admin is a
-- different incident than the one it was written to close.
--
-- The second escape was granting SELECT on business_moderation to anon and
-- authenticated so the subquery could resolve. MEASURED: it works, and it is
-- rejected here, because it hands `anon` a direct read of the moderation table
-- that the companion split exists to prevent — the zero-privilege state of that
-- table is what makes it a trustworthy anchor in the first place, and
-- businesses.rls.db.spec.ts pins it.
--
-- So the check goes through a SECURITY DEFINER helper. It is the narrowest
-- option: the client gains the ability to learn one boolean about one business,
-- which is information the catalog already implies for every business it lists,
-- and it still cannot read a single column of the table.
--
-- ─── The EXECUTE grant is explicit, and deliberately so ────────────────────
--
-- 20260507215323_harden_phase2_security_surface.sql revoked EXECUTE on
-- functions in `public` from PUBLIC, anon and authenticated, both for existing
-- functions and as a default privilege. In production that means a function
-- created by this migration is NOT executable by anyone until it says so, and
-- an RLS policy that calls a function the caller cannot execute fails with:
--
--     ERROR  42501  permission denied for function business_is_approved
--
-- The revoke below is therefore load-bearing, not hygiene: it states the
-- intended surface instead of inheriting whatever the default privileges happen
-- to be in the target environment. Note also that the test harness does NOT
-- reproduce that default revoke — a new `public` function is executable by PUBLIC
-- there — so the revoke is what keeps the harness describing production rather
-- than describing a wider surface that only exists locally.
--
-- ─── Measured on production before writing this ────────────────────────────
--
--     active businesses                    14
--     active and NOT approved               0
--     inactive businesses                   2
--     approved businesses                  14
--
-- Zero active businesses are unapproved, so this migration is a NO-OP on the
-- data that exists right now. It closes a latent hole without changing what
-- anybody can see today. That is the whole reason it is a safe change and not a
-- product decision.
--
-- The pre-flight guard below re-measures that on the target environment and
-- aborts if it is not true, so an environment where the backfill or the
-- bootstrap trigger has not run cannot silently apply this and empty the
-- catalog. Failing loudly is the correct direction: the alternative is a
-- migration that succeeds and hides every business on the platform.
--
-- ─── Fail-closed, and what that costs ──────────────────────────────────────
--
-- A business with NO row in business_moderation is invisible to the public
-- catalog, because `exists` over an absent row is false. That is the right
-- direction for a moderation gate, and in production it should not occur:
-- 20260925225227 backfilled the companion tables and phase 3's
-- trg_bootstrap_business_companions writes the row for every new business. The
-- guard is the check on that claim, and it runs on every apply.
--
-- Note what fail-closed does NOT touch. The panel keeps working, because this
-- gate is one PERMISSIVE SELECT policy among several and the admin policy and
-- the owner policies OR into it: an admin and a business owner both still see
-- unapproved businesses, and service_role bypasses RLS entirely. Only the
-- anonymous catalog narrows. MEASURED against an emptied business_moderation,
-- anon and a member see nothing while the admin, both owners and service_role
-- see their full sets.
--
-- ─── Residual disclosure, stated rather than hidden ────────────────────────
--
-- `anon` and `authenticated` hold EXECUTE on business_is_approved and can call
-- it directly with a business id, learning a boolean. The disclosure is
-- nil-practical rather than nil: for any business the catalog lists, the answer
-- is knowably true; for any other business the id is an unguessable uuid, and
-- "not listed" already implies "not approved". It is called out because the
-- honest description of a SECURITY DEFINER function added to a security policy
-- includes what it exposes, and this is what it exposes.
--
-- ─── Cost ──────────────────────────────────────────────────────────────────
--
-- One EXISTS per candidate row, resolved as an index lookup:
-- business_moderation_pkey is a unique btree on (business_id), so this is a
-- primary-key equality probe, not a scan, and no new index is warranted.
--
-- ─── Rollback ──────────────────────────────────────────────────────────────
--
-- Reverting restores `using (is_active = true)`, which is the pre-migration
-- state exactly — the predicate is the only thing this changes, and no column,
-- grant or table is touched. A rollback re-opens the hole described above, so
-- it is a security regression and not a neutral operation.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Pre-flight: refuse to apply where the gate would empty the catalog
-- ─────────────────────────────────────────────────────────────────────────────
-- Measured on production: 0. The guard exists so that an environment where
-- business_moderation is unpopulated fails here, loudly, instead of applying
-- and publishing an empty catalog.
do $$
declare
  v_unapproved integer;
begin
  select count(*) into v_unapproved
    from public.businesses b
   where b.is_active
     and not exists (
       select 1
         from public.business_moderation m
        where m.business_id = b.id
          and m.verification_status = 'approved'
     );

  if v_unapproved > 0 then
    raise exception
      'business moderation catalog gate: % active businesses have no approved row in public.business_moderation and would disappear from the public catalog. Populate business_moderation (20260925225227 backfill, or the phase 3 bootstrap trigger) and re-run. Aborting without changes.',
      v_unapproved;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The moderation check, as a SECURITY DEFINER function
-- ─────────────────────────────────────────────────────────────────────────────
-- The one place client roles get to read business_moderation, and it returns a
-- boolean rather than a row. STABLE because it reads and nothing writes from
-- the planner's point of view; the fixed empty search_path is the standard
-- definer hardening, and the body fully qualifies everything it names so the
-- empty search_path is safe rather than merely tidy.
create or replace function public.business_is_approved(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
      from public.business_moderation m
     where m.business_id = p_business_id
       and m.verification_status = 'approved'
  )
$function$;

-- Explicit on both sides, and neither is redundant. The revoke states the
-- surface rather than inheriting the environment's default privileges, and the
-- grant is what makes the policy reachable at all: a policy calling a function
-- the caller cannot execute fails with 42501 permission denied for function.
revoke all on function public.business_is_approved(uuid)
  from public, anon, authenticated;
grant execute on function public.business_is_approved(uuid) to anon, authenticated;

comment on function public.business_is_approved(uuid) is
  'Moderation gate for the public business catalog. SECURITY DEFINER because a policy subquery against business_moderation is permission-checked as the calling role and fails with 42501. Returns a boolean; grants no access to the table.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. The catalog policy
-- ─────────────────────────────────────────────────────────────────────────────
-- Same name, same role, same command: only the predicate grows. Dropped first
-- because CREATE POLICY has no OR REPLACE.
drop policy if exists "Anyone can view active businesses" on public.businesses;

create policy "Anyone can view active businesses"
  on public.businesses
  for select
  to public
  using (
    is_active = true
    and public.business_is_approved(businesses.id)
  );

comment on policy "Anyone can view active businesses" on public.businesses is
  'Public catalog: active AND approved. is_active is the curtain, moderation is the lock. is_active alone was a derived copy a client could influence through a side door, so the gate reads the source on business_moderation.';

commit;
