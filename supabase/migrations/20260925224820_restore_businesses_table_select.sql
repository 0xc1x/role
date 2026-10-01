begin;

grant select on table public.businesses to anon, authenticated;

comment on table public.businesses is
  'Public business profile. Table-level SELECT for anon/authenticated is required by PostgREST relationship resolution and cannot be replaced by per-column grants while offers, business_locations and orders hold foreign keys to this table. Sensitive columns (balance, commission_rate, verification_status, verified_at, verified_by, rejection_reason, owner_id) are therefore exposed to anon and must move to companion tables; see the migration that restored this grant.';

commit;
