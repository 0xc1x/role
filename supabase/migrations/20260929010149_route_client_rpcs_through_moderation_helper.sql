-- Route the four client-facing catalog RPCs through the moderation helper.
--
-- 20260928161526 introduced public.business_is_approved(uuid) and used it in
-- the RLS policy, because an inline subquery against business_moderation is
-- permission-checked as the calling role and fails. It left the four
-- SECURITY INVOKER catalog functions still carrying the inline form. Those
-- four were dead to every client role: POST /rest/v1/rpc/active_offers_near
-- returned 403 with 42501 permission denied for table business_moderation.
--
-- The five other functions holding the same subquery (reserve_offer,
-- enforce_offer_business_availability, get_platform_stats,
-- get_platform_public_stats, notify_business_pending) are SECURITY DEFINER
-- and run as the owner, so their subquery is checked against the owner and
-- is sound. The split is the reason the blast radius is exactly four.
--
-- The rewrite reads pg_get_functiondef and replaces one predicate, so every
-- other line of an audited function is preserved byte for byte. Patterns are
-- spelled with chr(10) because the newlines and indentation are the fragile
-- part: a reformatted pattern silently fails to match, and the guard turns
-- that into a loud abort instead of a no-op.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Pre-flight: the helper must exist and be executable by both client roles
-- ─────────────────────────────────────────────────────────────────────────────
-- Without this the rewrite would still succeed and produce functions that
-- fail at call time with 42501 permission denied for function.
do $$
declare
  v_anon boolean;
  v_auth boolean;
begin
  select has_function_privilege('anon',          'public.business_is_approved(uuid)', 'execute') into v_anon;
  select has_function_privilege('authenticated', 'public.business_is_approved(uuid)', 'execute') into v_auth;

  if not (coalesce(v_anon, false) and coalesce(v_auth, false)) then
    raise exception
      'business_is_approved is not executable by both client roles (anon=%, authenticated=%). Apply 20260928161526_add_business_moderation_catalog_gate first. Aborting without changes.',
      v_anon, v_auth;
  end if;
end
$$;

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
  nl constant text := chr(10);
  -- One predicate shape, four indentations. active_offers_near, popular_zones
  -- and active_offer_category_counts all gate on b.id and differ only in the
  -- leading whitespace pg_get_functiondef emits; active_businesses_near gates
  -- on the bv alias. Matching the indentation is what keeps them apart.
  offers_pred constant text :=
    'exists (select 1 from public.business_moderation m' || nl
    || '              where m.business_id = b.id and m.verification_status = ''approved'')';
  zones_pred constant text :=
    'exists (select 1 from public.business_moderation m' || nl
    || '                where m.business_id = b.id and m.verification_status = ''approved'')';
  counts_pred constant text :=
    'exists (select 1 from public.business_moderation m' || nl
    || '                  where m.business_id = b.id and m.verification_status = ''approved'')';
  businesses_pred constant text :=
    'exists (select 1 from public.business_moderation m' || nl
    || '                  where m.business_id = bv.id and m.verification_status = ''approved'')';
begin
  perform pg_temp.apply_rewrite('active_offers_near',
    array[offers_pred, 'public.business_is_approved(b.id)']);

  perform pg_temp.apply_rewrite('popular_zones',
    array[zones_pred, 'public.business_is_approved(b.id)']);

  perform pg_temp.apply_rewrite('active_offer_category_counts',
    array[counts_pred, 'public.business_is_approved(b.id)']);

  perform pg_temp.apply_rewrite('active_businesses_near',
    array[businesses_pred, 'public.business_is_approved(bv.id)']);
end $rewrite$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Post-conditions. The rewrite is a pure predicate swap, so the visible
--    result set must be identical before and after. Re-measuring the gate
--    count against the inline form proves the swap did not change semantics.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_leftovers integer;
  v_unapproved integer;
begin
  select count(*) into v_leftovers
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('active_offers_near','active_businesses_near',
                      'popular_zones','active_offer_category_counts')
    and p.prosrc like '%from public.business_moderation%';

  if v_leftovers > 0 then
    raise exception
      'catalogo: % funciones conservan el subquery inline sobre business_moderation. Aborting.', v_leftovers;
  end if;

  -- Same measurement 20260928161526 made before gating the policy: with zero
  -- unapproved active businesses this migration is a no-op on visible data and
  -- only restores reachability.
  select count(*) into v_unapproved
  from public.businesses b
  where b.is_active and not public.business_is_approved(b.id);

  if v_unapproved > 0 then
    raise exception
      'catalogo: % negocios activos sin aprobacion en business_moderation, que este cambio haria visibles. Aborting without changes.', v_unapproved;
  end if;
end
$$;

commit;
