-- Restore table-level SELECT on public.businesses, and record why.
--
-- THIS DELIBERATELY REVERSES PART OF 20260925163235. It is a temporary, dated
-- regression of finding P1-2, not a correction of it.
--
-- What 20260925163235 did: replaced table-wide SELECT on businesses with
-- per-column grants, so anon could not read balance, commission_rate,
-- verification_status, verified_at, verified_by, rejection_reason or owner_id.
-- For a direct read that works exactly as intended, and it is trivially
-- verifiable with has_column_privilege, which is why it looked correct.
--
-- Why it is wrong: it is incompatible with PostgREST. offers,
-- business_locations, orders and several other tables carry foreign keys to
-- businesses, and PostgREST needs table-level SELECT on a referenced table to
-- resolve relationships. So every read through /rest/v1/offers failed with
-- 42501 "permission denied for table businesses" - including select=id with no
-- embed at all, and including the offers catalog, which is the product.
--
-- The privilege matrix that passed, for the record:
--   GET /businesses?select=id,name,image  -> 200
--   GET /businesses?select=balance        -> 401   (by design)
--   GET /businesses?select=*              -> 401   (by design)
--   GET /offers?select=id                 -> 401   (not by design)
--
-- Column-level grants and PostgREST relationships are mutually exclusive. The
-- only two ways out are table-wide SELECT with those columns exposed, or moving
-- the columns off the table so the table itself is safe to expose.
--
-- EXPOSED TO ANON UNTIL THE FOLLOW-UP LANDS:
--   commission_rate, balance, verification_status, verified_at, verified_by,
--   rejection_reason, owner_id
-- Row access is still bounded by RLS: anon still only sees active businesses.
-- Note that a per-column REVOKE is deliberately absent. It would be a no-op:
-- once a role holds table-level SELECT, revoking individual columns does not
-- take them away. Writing it would be a mitigation that does not mitigate.
--
-- FOLLOW-UP, required before real customers: move those columns to companion
-- tables (business_finance, business_moderation) so businesses holds only
-- public data and table-wide SELECT is safe again. That touches the Drizzle
-- schema, the API business repository and mappers, the admin queries, the
-- enforce_offer_business_availability and sync_business_verification triggers,
-- reserve_offer, payout generation and their tests. The exposure is pinned by a
-- spec in apps/api/src/database/security/public-read-grants.spec.ts so it cannot
-- be forgotten quietly.
--
-- ROLLBACK: reverting this re-breaks every PostgREST read that touches
-- businesses, which is the offers catalog.

begin;

grant select on table public.businesses to anon, authenticated;

-- The per-column grants from 20260925163235 are now redundant: a table-level
-- grant is a superset. They are left in place rather than dropped, because a
-- future tightening of the table grant would otherwise silently depend on them
-- being absent.

comment on table public.businesses is
  'Public business profile. Table-level SELECT for anon/authenticated is required by PostgREST relationship resolution and cannot be replaced by per-column grants while offers, business_locations and orders hold foreign keys to this table. Sensitive columns (balance, commission_rate, verification_status, verified_at, verified_by, rejection_reason, owner_id) are therefore exposed to anon and must move to companion tables; see the migration that restored this grant.';

commit;
