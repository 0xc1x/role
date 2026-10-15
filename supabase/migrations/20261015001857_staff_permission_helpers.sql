
create or replace function public.business_member_role(p_business_id uuid)
returns public.business_member_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.business_members m
  where m.business_id = p_business_id
    and m.user_id = auth.uid()
    and m.deleted_at is null
    and m.status = 'active'
  limit 1
$$;

create or replace function public.can_manage_location(p_business_id uuid, p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when m.deleted_at is not null or m.status <> 'active' then false
      when m.role in ('owner', 'manager') then true
      when m.role = 'staff' and exists (
        select 1
        from public.business_member_locations l
        where l.member_id = m.id
          and l.location_id = p_location_id
          and l.deleted_at is null
      ) then
        case
          when m.session_ttl_hours > 0 and (
            m.last_authenticated_at is null
            or m.last_authenticated_at + (m.session_ttl_hours * interval '1 hour') < now()
          ) then false
          else true
        end
      else false
    end
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.deleted_at is null
  ), false)
$$;

create or replace function public.business_has_feature(p_business_id uuid, p_feature public.business_feature)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- This mapping MUST move in lockstep with BUSINESS_PLAN_FEATURES in
  -- packages/commons (src/business/enums/business-plan.ts). Any change to the
  -- catalog lands here in the same commit, or the trigger on growth and the
  -- API disagree on which tier carries which feature.
  select case coalesce(
    (select bps.plan_code
       from public.business_plans_state bps
      where bps.business_id = p_business_id
        and bps.deleted_at is null),
    'free'::public.business_plan_code
  )
    when 'free' then p_feature = 'staff_access'::public.business_feature
    when 'pro' then p_feature in ('staff_access'::public.business_feature, 'payments'::public.business_feature)
    when 'pro_plus' then p_feature in ('staff_access'::public.business_feature, 'payments'::public.business_feature, 'visibility_plus'::public.business_feature)
    else false
  end
$$;

create or replace function public.business_member_session_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member record;
  v_location_ids jsonb;
  v_expires_at timestamptz;
  v_reason text;
begin
  select m.id,
         m.business_id,
         m.role::text as role,
         m.status,
         m.session_ttl_hours,
         m.last_authenticated_at
    into v_member
    from public.business_members m
   where m.user_id = auth.uid()
     and m.deleted_at is null
   order by m.created_at asc
   limit 1;

  if v_member.id is null then
    return jsonb_build_object(
      'role', null,
      'location_ids', '[]'::jsonb,
      'expires_at', null,
      'reason', 'unauthorized'
    );
  end if;

  select coalesce(jsonb_agg(l.location_id), '[]'::jsonb)
    into v_location_ids
    from public.business_member_locations l
   where l.member_id = v_member.id
     and l.deleted_at is null;

  if v_member.status = 'disabled' then
    v_reason := 'disabled';
  elsif v_member.session_ttl_hours > 0 then
    if v_member.last_authenticated_at is null then
      v_reason := 'session_expired';
    else
      v_expires_at := v_member.last_authenticated_at + (v_member.session_ttl_hours * interval '1 hour');
      if v_expires_at < now() then
        v_reason := 'session_expired';
      else
        v_reason := 'ok';
      end if;
    end if;
  else
    v_reason := 'ok';
  end if;

  if v_member.session_ttl_hours > 0 and v_member.last_authenticated_at is not null then
    v_expires_at := v_member.last_authenticated_at + (v_member.session_ttl_hours * interval '1 hour');
  else
    v_expires_at := null;
  end if;

  return jsonb_build_object(
    'role', v_member.role,
    'location_ids', coalesce(v_location_ids, '[]'::jsonb),
    'expires_at', v_expires_at,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.business_member_role(uuid) from public, anon;
revoke all on function public.can_manage_location(uuid, uuid) from public, anon;
revoke all on function public.business_has_feature(uuid, public.business_feature) from public, anon;
revoke all on function public.business_member_session_state() from public, anon;

grant execute on function public.can_manage_location(uuid, uuid) to authenticated;
grant execute on function public.business_has_feature(uuid, public.business_feature) to authenticated;
grant execute on function public.business_member_session_state() to authenticated;
