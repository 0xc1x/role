-- Make the business_ownership SELECT policies live.
--
-- The previous migration created two SELECT policies on business_ownership for
-- authenticated, then revoked table privileges from authenticated right after,
-- which left the policies inert: with no grant there are no rows, so the
-- policies could never match. Dead policies are worse than no policies,
-- because they read as protection that does not exist.
--
-- The ownership policies on public.businesses in the next phase will query this
-- table AS authenticated, so the grant has to be live now rather than when it
-- is first needed.
--
-- anon stays out entirely. The owner policy is owner_id = auth.uid(), and
-- auth.uid() is null for anon, so anon would read nothing even with this grant.
-- The grant is withheld regardless, so the table is not discoverable at all.
--
-- ROLLBACK: revoking this leaves authenticated unable to read its own ownership
-- row, which breaks the owner policies in the next phase.

begin;

grant select on public.business_ownership to authenticated;
revoke select on public.business_ownership from anon;

commit;
