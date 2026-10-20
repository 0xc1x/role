-- ─────────────────────────────────────────────────────────────────────────────
-- La cuenta de la expiración queda en un solo sitio, de verdad esta vez
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── QUÉ CORRIGE ─────────────────────────────────────────────────────────────
--
-- `20261015024825` sacó `business_member_session_expires_at` y le dijo, en su
-- encabezado y en el README, que era la única cuenta de la expiración del
-- sistema. No lo era. Medido en la base viva al escribir esto:
--
--   business_member_session_expires_at   tiene la aritmética   ✓
--   business_member_session_valid        llama a la compartida ✓
--   can_manage_location                 tiene la aritmética   ✗
--   business_member_session_state        tiene la aritmética   ✗
--
-- O sea tres copias, de las cuales la nueva no compartía con nadie. Lo único
-- que las ataba era la matriz de comportamiento del spec, que es una línea de
-- defensa de último recurso: si dos copias se apartan, la matriz falla cuando
-- alguien encuentra el caso, no cuando alguien lo introduce.
--
-- Acá se reescriben las dos funciones viejas para que llamen a la compartida.
-- Es el orden correcto: primero la cuenta, después los que la usan.
--
-- ─── POR QUÉ IMPORTA Y NO ES COSMÉTICA ──────────────────────────────────────
--
-- El §5.2 exige que la que autoriza y la que explica nunca se contradigan. Eso
-- se cumple hoy por una matriz de pruebas, no por construcción. La diferencia
-- entre las dos cosas es la diferencia entre un invariante y una casualidad:
-- invariante se sostiene solo cuando nadie lo rompe, y una coincidencia se
-- sostiene hasta la próxima edición.
--
-- Y el enunciado equivocado no se puede arreglar donde está: el encabezado de
-- `20261015024825` está sellado. Quien lo lea dentro de dos años se va a creer
-- una cosa que era falsa el día que se escribió. La única forma de que no mienta
-- es que la afirmación pase a ser cierta, y la corrección queda en el README,
-- que sí se puede escribir.
--
-- ─── LOS CAMBIOS SON DE UNA LÍNEA, Y LA SEMÁNTICA ES LA MISMA ───────────────
--
-- En `can_manage_location` la rama vencida era
--
--   session_ttl_hours > 0 and (last_authenticated_at is null
--                             or last_authenticated_at + ttl * 1 hour < now())
--
-- y ahora son las dos mitades leídas del valor compartido: con sello y vencido, o
-- sin sello con el TTL puesto. La cuenta compartida devuelve `null` cuando el TTL
-- está apagado o cuando nunca hubo sello, así que `expires_at is not null` ya
-- implica "con sello", y la equivalencia es exacta.
--
-- En `business_member_session_state` la asignación se reemplaza por una llamada
-- y el `reason` de abajo, que ya leía de `v_expires_at`, no se toca. No cambia
-- ningún código, ningún mensaje y ninguna forma del `jsonb` de retorno.
--
-- ─── LO QUE NO SE TOCA ──────────────────────────────────────────────────────
--
-- `business_member_role` sigue sin TTL, y esa sigue siendo la decisión correcta:
-- el panel necesita el rol para poder explicar la salida. Ninguna de las dos
-- funciones cambia de firma, de volatility, de `security definer` ni de
-- `search_path`, y ninguna lleva `grant` ni `revoke`.

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
    --
    -- `expires_at` no se calcula acá. Sale de
    -- `business_member_session_expires_at`, que es la única cuenta de la
    -- expiración del sistema; la comparten esta función,
    -- `business_member_session_state` y `business_member_session_valid`. Antes
    -- esta escribía la aritmética en la rama de más abajo y eran dos copias.
    select m.id,
           m.session_ttl_hours,
           m.last_authenticated_at,
           public.business_member_session_expires_at(
             m.session_ttl_hours,
             m.last_authenticated_at
           ) as expires_at
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
      -- es el modo "equipo propio" del §9.2. Las dos mitades de "vencida" se
      -- leen del valor compartido en vez de recalcularse: con sello y vencido, y
      -- sin sello con el TTL puesto. `expires_at is null` cuando el TTL está
      -- apagado o nunca hubo sello, así que la primera mitad ya implica que sí
      -- lo había.
      when (m.expires_at is not null and m.expires_at < now())
           or (m.session_ttl_hours > 0 and m.last_authenticated_at is null)
      then false
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
  ), false);
$$;

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

  -- La expiración se CALCULA UNA VEZ, y sale de
  -- `business_member_session_expires_at`: la misma cuenta que usan
  -- `can_manage_location` y `business_member_session_valid`. Esta función la
  -- escribía acá y eran dos copias del mismo cálculo, atadas solo por una
  -- matriz de pruebas; el §5.2 pide que no se contradigan, y eso se sostiene
  -- mejor si no hay dos que puedan contradecirse.
  v_expires_at := public.business_member_session_expires_at(
    v_row.session_ttl_hours,
    v_row.last_authenticated_at
  );

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