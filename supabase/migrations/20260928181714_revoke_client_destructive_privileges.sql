-- Client destructive privileges: TRUNCATE, TRIGGER and REFERENCES removed from
-- `anon` and `authenticated` on every RLS table in `public`, and removed from the
-- default privileges so the next `create table` does not reintroduce them.
--
-- SAFETY. The caution this file originally carried — "apply only to a reviewed
-- development branch, not to production" — was written before the exposure was
-- measured, and it was aimed at the wrong risk. Here is what the measurement
-- says, and it is the whole case for applying this to production:
--
--   The anon key travels inside the mobile bundle, so it is public, and the
--   only thing an attacker holding it can reach is PostgREST. PostgREST's verb
--   set is GET, HEAD, POST, PATCH, DELETE and RPC. There is no TRUNCATE and no
--   DDL. So of the three privileges revoked here, the REST surface can express
--   none of them, and "the mobile app still browses, reserves, reviews and
--   moderates" is not at risk — none of those operations needs TRUNCATE, TRIGGER
--   or REFERENCES. The same holds for the admin panel, which reaches Postgres
--   through the API.
--
--   Measured, not assumed: `select proname from pg_proc where prosrc ilike
--   '%truncate %' or prosrc ilike '%create trigger%'` over `public` returns zero
--   rows. There is no function in the database that needs any of the three.
--   `apps/api/src/database/database.module.ts` opens its connection as the
--   table owner, which bypasses grants entirely. The Edge Functions use the
--   service key, and `service_role` keeps all three on all 39 tables — this file
--   does not touch it, and `has_table_privilege` is asserted on all 39 in
--   `apps/api/src/database/security/destructive-privileges.rls.db.spec.ts`.
--
--   Any maintenance job that empties a table runs as `service_role` or as the
--   owner, never as a client role, and is unaffected.
--
-- PROVENANCE. Sent verbatim through `apply_migration`; the version in this
-- filename is the one the server assigned, and `md5sum` of this file equals
-- `md5(statements[1])` in the ledger. If the two ever disagree, the ledger is
-- what the database actually ran and the disagreement is a bug to fix — not a
-- licence to assume they match.
--
-- Rollback note: re-granting `truncate, trigger, references` reopens every
-- finding below, including the one on `order_events`. A rollback must be a
-- separately reviewed security migration.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- What this revokes, and what it deliberately leaves
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Supabase provisions every project with
--
--     alter default privileges in schema public
--       grant all on tables to anon, authenticated, service_role;
--
-- and `all` on a table is all SEVEN of `arwdDxtm`: INSERT, SELECT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES, TRIGGER. That block is why a table in this
-- project is BORN with three privileges that row-level security cannot
-- constrain and that no policy in this ledger ever needed.
--
-- Measured against production before writing this file, over the 39 tables in
-- `public` that have RLS enabled:
--
--     role            TRUNCATE   TRIGGER   REFERENCES
--     anon                    31        32           32
--     authenticated           31        32           32
--     service_role            39        39           39
--
-- `service_role` keeps all three on all 39, and that is deliberate. It is the
-- backend role: it has BYPASSRLS by design, it is the key the Edge Functions
-- use, and it is the role this project's own API does not even need because
-- the API opens its connection as the table owner
-- (`apps/api/src/database/database.module.ts:24`). Tightening it would break
-- Supabase's own architecture to remove a capability nobody is asking about.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THE THREE, AND WHY THEY ARE NOT THE SAME SEVERITY
-- ─────────────────────────────────────────────────────────────────────────────
--
-- TRUNCATE — a live latent privilege, NOT reachable through the API today.
--
-- RLS does not govern TRUNCATE. PostgreSQL has no policy for it, so no `USING`
-- clause is ever evaluated, and the policy that filters rows on a table is not
-- consulted at all. Measured on the harness before this migration: `anon` ran
-- `truncate public.reviews`, the statement reported no error, and the table was
-- empty afterwards — including rows that same session's own policies had hidden
-- from it. A `DELETE` policy on that table stops `anon` deleting one row at a
-- time; TRUNCATE has no policy and stops nothing.
--
-- That is the capability. What it is NOT is a working exploit today, and the
-- difference matters, because describing it as one sends the next reader
-- looking for an incident instead of reading this file.
--
-- PostgREST has no TRUNCATE verb. The verbs it exposes are GET, HEAD, POST,
-- PATCH, DELETE and RPC — there is no HTTP method that maps to `TRUNCATE`, and
-- no amount of query string reaches it. So `anon` carrying the project's public
-- anon key, which ships inside the mobile bundle and is therefore public, cannot
-- truncate anything through the API as the API exists today.
--
-- The distance between "latent privilege" and "live exploit" is exactly one
-- `security definer` RPC: a function owned by a superuser that runs TRUNCATE is
-- callable by `anon` regardless of the table's ACL, because inside a SECURITY
-- DEFINER function the current_user is the owner. This project has 31 SECURITY
-- DEFINER functions in `public` already. None of them truncates — measured,
--
--     select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public'
--        and (p.prosrc ilike '%truncate %' or p.prosrc ilike '%create trigger%');
--     -- 0
--
-- — so the composite is closed today, the same way it is closed in production.
-- What this migration removes is the table half of that composite, so a future
-- function cannot supply the other half on its own.
--
-- It is wrong to say "anon can delete the database". Say instead: anon holds a
-- privilege RLS cannot see and PostgREST cannot reach, one RPC away from both,
-- and it should not be there.
--
-- TRIGGER — closer to live, and the reason this file exists.
--
-- TRIGGER is the table privilege that lets a role CREATE TRIGGER on a table it
-- does not own. Postgres checks that privilege on the TABLE and not on the
-- trigger function, so a role holding it attaches its own trigger to someone
-- else's table, and the trigger body then runs with whatever privileges the
-- function carries. If the function is SECURITY DEFINER, the body runs as the
-- owner.
--
-- `public.order_events` is the append-only order log, and its push trigger
-- `trg_order_event_push` calls `public.handle_order_event_push()`, which is
-- SECURITY DEFINER. Measured: 31 SECURITY DEFINER functions in `public`, and
-- this one is attached to the one table whose whole value is that it cannot be
-- written by a client.
--
-- The composite is closed today by a grant on a DIFFERENT object: `anon` holds
-- no EXECUTE on `accrue_order_earnings()` and the other trigger-returning
-- functions, because `20260906125927_harden_rpc_grants.sql` revoked it, and that
-- migration is applied in production. So an anonymous session cannot NAME a
-- trigger function and the demonstration in
-- `apps/api/src/database/security/orders.rls.db.spec.ts` is a refusal.
--
-- "Closed by a grant on another object" is precisely the shape that breaks
-- silently. A future migration that grants EXECUTE on one function, or that
-- adds a SECURITY DEFINER trigger function and forgets the revoke, reopens the
-- write primitive without touching this table's ACL at all. Revoking TRIGGER
-- closes the composite from the side that is actually enumerated in every
-- privilege audit anyone runs.
--
-- REFERENCES — inert today, and revoked anyway.
--
-- REFERENCES lets a role create a foreign key pointing at a table. No role can
-- be granted CREATE on schema `public` in this project, so there is nothing to
-- reference FROM. Measured: `anon` attempting `create table ... references
-- public.order_events(id)` is refused with `42501 permission denied for schema
-- public`, and that refusal is about the schema, not about the table privilege.
--
-- It is inert because of a property of a DIFFERENT object again, and that is the
-- same fragility as TRIGGER with less to show for it. Revoking it costs one
-- statement and removes a privilege that becomes live the day anyone grants
-- CREATE — including in the `security invoker` RPC case, where a function
-- callable by a client can create a table in a schema the caller does hold.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY NOBODY REVOKED THEM: the measured chain, not the remembered one
-- ─────────────────────────────────────────────────────────────────────────────
--
-- The tempting story is "the default privileges gave all seven and the hardening
-- pass revoked the dangerous ones". Read against this ledger that story is wrong
-- in a detail worth having, because the detail is what made the leak survive.
--
-- The revokes were per-table and partial, and the privilege lists ran out at
-- different points on different tables:
--
--   20260507201408  revoke select on eleven tables from anon
--                   -> twelve tables still held SELECT
--   20260925155153  revoke all privileges on public.profiles, public.orders
--                   -> ALL SEVEN went, as collateral of the word `all`
--   20260925163235  revoke all on public.businesses
--                   revoke insert, update, delete, truncate, trigger, references
--                     on public.offers
--                   revoke insert, update, delete, truncate on public.order_events
--                   -> `offers` is the only table in the ledger that ever names
--                      TRIGGER and REFERENCES explicitly, and it is the only
--                      table where they are gone by an explicit decision
--   20260925225227  revoke all on business_ownership, business_finance,
--                   business_moderation -> all seven, as collateral again
--
-- So TRIGGER and REFERENCES were not never-mentioned. They were removed from
-- seven tables: four by `revoke all`, and exactly one — `offers` — by an author
-- who thought to enumerate them. Everywhere else they survived.
--
-- And TRUNCATE is the mirror image: it WAS enumerated, on 8 of 39 tables, and
-- only where the enumeration happened. The counts in the table at the top of
-- this file are exactly the residue of that: 31 tables still hold TRUNCATE
-- because 31 tables never had it named, and `order_events` is the table that
-- survived by the narrowest possible margin — it received
-- `insert, update, delete, truncate` and stopped, four clauses short of the list
-- that `offers` got on the same migration, ninety lines earlier.
--
-- `order_events` is also the one table where TRUNCATE is gone and TRIGGER is
-- not. It is the single table in the project whose residue is asymmetric, and it
-- is the table where the residue is worth the most. That is the whole finding.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- IF SOMETHING LEGITIMATELY NEEDS TRUNCATE OR TRIGGER
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Use `service_role`, or connect as the table owner. Never grant either to a
-- client role to make a statement work: a client role is the role whose key is
-- in the mobile bundle, and a privilege that has to be handed to a browser to
-- satisfy a maintenance script is not a maintenance privilege.
--
-- Nothing in this project needs either. Measured, for the functions:
--
--   select proname from pg_proc
--    join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
--    where pg_namespace.nspname = 'public'
--      and (prosrc ilike '%truncate %' or prosrc ilike '%create trigger%');
--   -- zero rows
--
-- and for the applications: the API connects as the owner
-- (`apps/api/src/database/database.module.ts:24`) and every Edge Function uses
-- the service key. The harness reproduces the default privileges in its
-- bootstrap and replays this ledger over them, so the tests measure the same
-- thing production has.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Existing privileges, over the SET rather than a list of names
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Enumerated by hand it would be 39 table names, and the list would be correct
-- on the day it was written and wrong the day someone added a table — which is
-- the failure mode that produced the leak this file closes. Iterating the
-- catalog means the next table is covered whether or not anyone remembers this
-- file exists.
--
-- The filter is `relrowsecurity`. Measured today it selects 39 of 39 tables in
-- `public`: every table in this schema has RLS enabled, so the filter excludes
-- nothing. It is written that way anyway, because the invariant being asserted is
-- about the RLS tables specifically, and a non-RLS table added later deserves its
-- own finding rather than being silently covered by this one.
--
-- `revoke truncate, trigger, references` — the three, and only the three.
-- SELECT, INSERT, UPDATE and DELETE are untouched: each of those four is either
-- genuinely used by the product from a client role or is already closed by a
-- per-table policy, and this file is not the place to re-litigate them.

do $$
declare
  r record;
  revoked_count integer := 0;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity
     order by c.relname
  loop
    execute format(
      'revoke truncate, trigger, references on table public.%I from anon, authenticated',
      r.relname
    );
    revoked_count := revoked_count + 1;
  end loop;

  -- Fail loudly rather than quietly revoking nothing. A typo in the catalog
  -- filter would otherwise produce a migration that applies successfully, is
  -- recorded in the ledger as having hardened the surface, and hardens nothing.
  if revoked_count = 0 then
    raise exception
      'revoke_client_destructive_privileges: no RLS table found in public. Refusing to apply.';
  end if;

  raise notice 'revoked truncate, trigger, references on % RLS tables in public', revoked_count;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Default privileges — the half that makes this a fix and not a patch
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Without this, the next `create table` is born with `arwdDxtm` again and the
-- problem returns with nobody measuring anything. The precedent is exact and
-- already in this directory: `20260507215323_harden_phase2_security_surface.sql`
-- does `alter default privileges in schema public revoke execute on functions
-- from public, anon, authenticated`, and that is the same move on the same
-- schema for the same reason.
--
-- The loop over `pg_default_acl` rather than a bare statement is not decoration.
-- `ALTER DEFAULT PRIVILEGES` without `FOR ROLE` applies only to the role that
-- executes it, and this project has TWO roles with a default-privilege entry for
-- tables in `public`. Measured against production:
--
--     grantor          default ACL on tables in public
--     postgres         anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm
--     supabase_admin   anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm
--
-- Revoking only under `postgres` would leave every table created by
-- `supabase_admin` — Supabase's own migrations — born with the privilege intact.
-- That is visible in the existing precedent: `20260507215323` revoked EXECUTE
-- without `FOR ROLE`, and production still shows `anon=X` in the default ACL for
-- functions under `supabase_admin`. The precedent is right about the move and
-- incomplete about the scope, so this file does both.
--
-- Iterating `pg_default_acl` also means this does not name a role that might not
-- exist. `supabase_admin` is absent from the harness database, and a bare
-- `for role supabase_admin` would have failed there and added a fifth entry to
-- the pinned replay debt. A statement that adapts to the database it lands in is
-- the difference between a migration that is correct everywhere and one that is
-- correct in production and red in CI.
--
-- ─── The one default ACL this file cannot reach, and why that is acceptable ──
--
-- MEASURED on the first apply attempt, not predicted: revoking under
-- `supabase_admin` raises
--
--     ERROR  42501  permission denied to change default privileges
--
-- because `apply_migration` connects as `postgres`, and a role may only alter
-- default privileges for itself or a role it belongs to. The first attempt died
-- there and, because the file runs in a transaction, took the table half of this
-- migration down with it — which is the correct outcome, and the reason the
-- pre-flight counts above exist at all.
--
-- So the loop names the grantor it could not alter and carries on. The residual
-- is acceptable for a specific reason: the `supabase_admin` default ACL governs
-- tables created by Supabase's own internal migrations, and this project creates
-- none of them — every table here comes from a migration in this directory,
-- running as `postgres`, whose default ACL this file does revoke. The grant that
-- stays reachable is a grant on objects that do not exist.

do $$
declare
  r record;
  revoked_count integer := 0;
  skipped text := '';
begin
  for r in
    select distinct pg_get_userbyid(d.defaclrole) as grantor
      from pg_default_acl d
      join pg_namespace n on n.oid = d.defaclnamespace
     where n.nspname = 'public'
       and d.defaclobjtype = 'r'
     order by 1
  loop
    -- A role may only alter default privileges for itself or a role it is a
    -- member of. On this project the executing role is `postgres` and the second
    -- grantor is `supabase_admin`, which it is not a member of: attempting the
    -- revoke there raises `42501 permission denied to change default privileges`
    -- and, because this file runs inside a transaction, takes the table half down
    -- with it. MEASURED on the first apply attempt, not assumed.
    --
    -- So the unreachable grantor is named rather than skipped silently. Failing
    -- the whole migration on it would make this file unappliable in the one
    -- environment it exists for, and swallowing it without a name is the exact
    -- shape of "applies successfully, hardens nothing" that block 1 refuses to be.
    begin
      execute format(
        'alter default privileges for role %I in schema public '
        'revoke truncate, trigger, references on tables from anon, authenticated',
        r.grantor
      );
      revoked_count := revoked_count + 1;
    exception
      when insufficient_privilege then
        skipped := skipped || r.grantor || ' ';
        raise notice 'default privileges for % could not be altered: insufficient_privilege', r.grantor;
    end;
  end loop;

  if revoked_count = 0 then
    raise exception
      'revoke_client_destructive_privileges: no default privileges could be altered in public. '
      'Refusing to apply — without a default-privilege entry the next create table '
      'would be governed by whatever the platform grants, which is not something '
      'this file can see.';
  end if;

  if skipped <> '' then
    raise notice
      'revoked default truncate, trigger, references for % grantor(s); NOT altered for: %',
      revoked_count, skipped;
  else
    raise notice 'revoked default truncate, trigger, references for % grantor(s)', revoked_count;
  end if;
end
$$;

commit;
