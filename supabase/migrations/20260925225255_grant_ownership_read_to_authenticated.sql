begin;

-- The two SELECT policies on business_ownership were created for authenticated
-- in the previous migration, but that migration revoked table privileges from
-- authenticated straight after, leaving the policies inert: no grant, no rows.
-- Ownership policies in the next phase will query this table AS authenticated,
-- so the grant has to be live now, not when it is first needed.
grant select on public.business_ownership to authenticated;

-- anon stays out entirely. The owner policy is owner_id = auth.uid(), and
-- auth.uid() is null for anon, so even with this grant anon would read nothing.
-- The grant is withheld regardless, so the table is not discoverable.
revoke select on public.business_ownership from anon;

commit;
