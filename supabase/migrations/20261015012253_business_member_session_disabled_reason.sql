-- ─────────────────────────────────────────────────────────────────────────────
-- "Te pausaron" no es "no te conozco": la razón `disabled` vuelve al estado
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── QUÉ CAMBIA, Y POR QUÉ ──────────────────────────────────────────────────
--
-- `20261015003929_business_member_permission_hardening.sql` quedó bien en todo lo
-- que se le pidió y de paso borró una cosa que nadie le había pedido: la rama
-- `status = 'disabled'` de `business_member_session_state`. La justificación de
-- entonces —"el vocabulario del §5.2 no tiene `disabled`"— era circular: esa
-- tabla la había escrito el mismo round, once minutos antes. No era autoridad,
-- era el mismo cambio disfrazado de criterio.
--
-- Y lo que se perdió es justo la razón de existir de la función. El §5.2 la
-- define como lo que permite que el panel "explique la salida en vez de mostrar
-- un error genérico", y `no_membership` ES el error genérico. A quien le
-- pausaron el acceso hay que explicarle lo que le pasó: el vocabulario del panel
-- ya distingue **pausar** de **dar de baja**, y "disabled corta acceso de
-- inmediato" es un requisito de verificación, no una nota.
--
-- ─── DÓNDE VA LA CONSULTA DE LA FILA PAUSADA, Y POR QUÉ ──────────────────────
--
-- Después de la selección por `status = 'active'` y `deleted_at is null`, nunca
-- antes. Alguien activo en A y pausado en B sigue siendo `ok` en A: si la fila
-- pausada se consultara antes, esa persona recibiría `disabled` y nunca llegaría
-- al `ok` que A le debe. El predicado de selección no cambia —es el que arregla
-- el bug de la fila deshabilitada más vieja tapando la activa— y la fila
-- pausada se busca con `exists`, nunca ampliando la agregación: `business_ids` es
-- la lista de negocios en los que se puede actuar, y un negocio pausado no es uno.
--
-- El sondeo exige `deleted_at is null`. Una fila borrada no concede nada por
-- ningún camino, pero tampoco es "te pausaron": es nada, y `no_membership` es la
-- respuesta honesta para ella.
--
-- La respuesta de la pausa es MÁS corta que la que daba la versión sellada: `role`
-- en null y `location_ids` vacío, en vez de devolverle a una membresía revocada su
-- rol y sus sucursales para poder pintar un mensaje.

-- ─── EL PERMISO, Y EL `deleted_at` QUE LE TOCABA ─────────────────────────────
--
-- El §6.3 nombra a `can_manage_location` entre los lectores que deben filtrar
-- `deleted_at is null`. El predicado ya estaba, pero lo traía `business_member_role`
-- a través del `member_role is null` de la función, no el cuerpo de esta: el
-- efecto era el mismo y el texto no. Una fila borrada no concede acceso por
-- ningún camino, y esto lo dice donde se lee el código, no dos capas más abajo.
create or replace function public.can_manage_location(p_business_id uuid, p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with member as (
    -- Solo los datos de SESIÓN. El rol no sale de aquí: sale de abajo, de
    -- `business_member_role`, para que exista una sola definición de qué es
    -- tener acceso. La fila se busca por `(business_id, user_id)`, que es único,
    -- así que el join con `role_of` nunca puede multiplicar filas.
    --
    -- `deleted_at is null` va aquí y no solo como efecto indirecto del
    -- `member_role is null` de más abajo: el §6.3 lista esta función entre los
    -- lectores de membresías que filtran las filas borradas, y un predicado que
    -- depende de otra función es un predicado que no se ve al leer esta.
    select m.id, m.session_ttl_hours, m.last_authenticated_at
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.deleted_at is null
  ),
  role_of as (
    select public.business_member_role(p_business_id) as member_role
  )
  select coalesce((
    select case
      when not exists (
        select 1
        from public.business_locations bl
        where bl.id = p_location_id
          and bl.business_id = p_business_id
      ) then false
      when r.member_role is null then false
      -- `session_ttl_hours = 0` se salta la comprobación, para todos los roles:
      -- es el modo "equipo propio" del §9.2.
      when m.session_ttl_hours > 0 and (
        m.last_authenticated_at is null
        or m.last_authenticated_at + (m.session_ttl_hours * interval '1 hour') < now()
      ) then false
      when r.member_role in ('owner', 'manager') then true
      when exists (
        select 1
        from public.business_member_locations l
        where l.member_id = m.id
          and l.location_id = p_location_id
          and l.deleted_at is null
      ) then true
      else false
    end
    from member m
    cross join role_of r
  ), false)
$$;

-- ─── EL ESTADO, Y LA FILA PAUSADA ────────────────────────────────────────────
--
-- El cuerpo es el de 20261015003929 con una rama nueva, entre el `no_membership`
-- y el guardia de `multiple_businesses`: si la selección por `status` no encontró
-- nada y aun así hay una membresía PAUSADA, la respuesta es `disabled`.
create or replace function public.business_member_session_state(p_business_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_business_ids jsonb;
  v_row record;
  v_locations jsonb;
  v_expires_at timestamptz;
  v_reason text;
begin
  -- `status` y `deleted_at` están en el predicado y no en un filtro de
  -- afterthought: una membresía deshabilitada más vieja no puede tapar la
  -- activa, y una borrada no es una membresía.
  if p_business_id is not null then
    select coalesce(jsonb_agg(m.business_id order by m.business_id), '[]'::jsonb)
      into v_business_ids
      from public.business_members m
     where m.user_id = auth.uid()
       and m.business_id = p_business_id
       and m.deleted_at is null
       and m.status = 'active';
  else
    select coalesce(jsonb_agg(m.business_id order by m.business_id), '[]'::jsonb)
      into v_business_ids
      from public.business_members m
     where m.user_id = auth.uid()
       and m.deleted_at is null
       and m.status = 'active';
  end if;

  if jsonb_array_length(v_business_ids) = 0 then
    -- Antes de decir "no te conozco" se pregunta si te pausaron. Es un `exists`
    -- y no un segundo `jsonb_agg`: `business_ids` es la lista de negocios en los
    -- que se puede actuar, y el negocio pausado no es uno. Aquí la lista agregada
    -- está vacía por construcción —no hay ninguna fila activa— y se devuelve tal
    -- cual para que el campo signifique lo mismo en las cinco razones.
    --
    -- Y exige `deleted_at is null`: una fila borrada no concede nada por ningún
    -- camino, pero "no existe" no es "te pausaron".
    if exists (
      select 1
      from public.business_members m
     where m.user_id = auth.uid()
       and (p_business_id is null or m.business_id = p_business_id)
       and m.status = 'disabled'
       and m.deleted_at is null
    ) then
      return jsonb_build_object(
        'role', null,
        'location_ids', '[]'::jsonb,
        'expires_at', null,
        'reason', 'disabled',
        'business_ids', coalesce(v_business_ids, '[]'::jsonb)
      );
    end if;

    return jsonb_build_object(
      'role', null,
      'location_ids', '[]'::jsonb,
      'expires_at', null,
      'reason', 'no_membership',
      'business_ids', '[]'::jsonb
    );
  end if;

  if p_business_id is null and jsonb_array_length(v_business_ids) > 1 then
    return jsonb_build_object(
      'role', null,
      'location_ids', '[]'::jsonb,
      'expires_at', null,
      'reason', 'multiple_businesses',
      'business_ids', v_business_ids
    );
  end if;

  select m.id,
         m.business_id,
         m.role::text as role,
         m.session_ttl_hours,
         m.last_authenticated_at
    into v_row
    from public.business_members m
   where m.user_id = auth.uid()
     and m.business_id = coalesce(p_business_id, (v_business_ids ->> 0)::uuid)
     and m.deleted_at is null
     and m.status = 'active'
   limit 1;

  select coalesce(jsonb_agg(l.location_id order by l.location_id), '[]'::jsonb)
    into v_locations
    from public.business_member_locations l
   where l.member_id = v_row.id
     and l.deleted_at is null;

  -- La expiración se CALCULA UNA VEZ. Antes se escribía la misma expresión dos
  -- veces, y la segunda pisaba el valor con un null que el `reason` ya había
  -- declarado vencido.
  if v_row.session_ttl_hours > 0 and v_row.last_authenticated_at is not null then
    v_expires_at := v_row.last_authenticated_at + (v_row.session_ttl_hours * interval '1 hour');
  else
    v_expires_at := null;
  end if;

  -- Nunca sellada no es vencida: no hubo sesión que expirar, así que el panel
  -- tiene que pedir un login y no buscar una fecha de vencimiento que no existe.
  if v_row.session_ttl_hours > 0 and v_row.last_authenticated_at is null then
    v_reason := 'session_never_stamped';
  elsif v_expires_at is not null and v_expires_at < now() then
    v_reason := 'session_expired';
  else
    v_reason := 'ok';
  end if;

  return jsonb_build_object(
    'role', v_row.role,
    'location_ids', coalesce(v_locations, '[]'::jsonb),
    'expires_at', v_expires_at,
    'reason', v_reason,
    'business_ids', v_business_ids
  );
end;
$$;

-- El perímetro no cambia y se repite aquí para que el archivo se lea solo:
-- `create or replace` conserva los privilegios de la versión anterior, pero
-- quien lea esta migración tiene que ver el perímetro sin saltar a la anterior.
revoke all on function public.business_member_role(uuid) from public, anon;
revoke all on function public.can_manage_location(uuid, uuid) from public, anon;
revoke all on function public.business_has_feature(uuid, public.business_feature) from public, anon;
revoke all on function public.business_member_session_state(uuid) from public, anon;

grant execute on function public.business_member_role(uuid) to authenticated;
grant execute on function public.can_manage_location(uuid, uuid) to authenticated;
grant execute on function public.business_has_feature(uuid, public.business_feature) to authenticated;
grant execute on function public.business_member_session_state(uuid) to authenticated;
