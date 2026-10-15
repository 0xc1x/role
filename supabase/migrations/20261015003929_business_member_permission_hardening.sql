-- ─────────────────────────────────────────────────────────────────────────────
-- Endurecimiento de los helpers de permiso: la misma regla, escrita una vez
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── QUÉ CAMBIA, Y POR QUÉ ──────────────────────────────────────────────────
--
-- `20261015001857_staff_permission_helpers.sql` puso las cuatro funciones en su
-- lugar y los doce tests en verde. Al usarlas aparecieron cinco cosas que esa
-- versión no podía ver, porque las cinco son huecos de la REGLA y no de la
-- mecánica:
--
-- 1. `business_member_role` quedó sin grant para `authenticated`, con la idea de
--    que era "interna" de `can_manage_location`. No lo era: `can_manage_location`
--    repetía la consulta del rol en vez de llamarla, así que la regla "qué rol
--    tiene esta persona en este negocio" estaba escrita DOS veces y las policies
--    de la §6.2 —que la llaman por su nombre, como `authenticated`— morían con
--    `42501 permission denied` en un SELECT de lectura. Se corrigen las dos
--    mitades: se le concede el grant y `can_manage_location` la llama. La regla
--    del rol tiene que vivir en un sitio, y un sitio es el que se puede auditar.
--
-- 2. `can_manage_location` no comprobaba que la sucursal fuera del negocio.
--    `business_member_locations.location_id` no lleva ninguna restricción que lo
--    ate al `business_id` del miembro, así que la fila malformada es
--    representable y un `staff` de A con una fila de alcance apuntando a una
--    sucursal de B recibía `true` para `(A, sucursal_de_B)`. Y el permiso ES la
--    última frontera: la API escribe con `service_role`, que pasa por encima de
--    RLS. La fila de alcance es un alcance DENTRO de un negocio, no un alcance
--    a secas.
--
-- 3. El TTL solo corría para `staff`. El §5.2 no abre excepción para dueño ni
--    gerente —el §9.2 les ofrece a esos dos el modo equipo con
--    `session_ttl_hours = 0`, o sea que se espera que su TTL venza—, así que un
--    dueño con la sesión de hace tres días tenía el panel diciéndole "venció tu
--    sesión" mientras RLS le seguía concediendo todo. El orden nuevo es
--    membresía activa → sesión válida → el rol decide el alcance. La función que
--    autoriza y la que explica tienen que contar la misma historia.
--
-- 4. `business_member_session_state()` elegía membresía por `created_at` sin
--    mirar `status`, así que una fila deshabilitada más vieja tapaba la activa y
--    el panel recibía el negocio equivocado. El §5.2 ahora define el argumento
--    opcional: con varias membresías activas la respuesta es
--    `multiple_businesses` con la lista, no una fila elegida a dedo.
--
-- 5. Una membresía nunca sellada devolvía `session_expired` con
--    `expires_at: null`, que le pide al panel una fecha que no existe: no
--    venció ninguna sesión, es que no hubo sesión. Ahora tiene su propio
--    `session_never_stamped`, y la fecha de expiración se calcula una sola vez.
--
-- ─── LO QUE NO SE TOCA ──────────────────────────────────────────────────────
--
-- Las cuatro siguen siendo `STABLE SECURITY DEFINER` con `search_path = ''`,
-- totalmente calificadas, sin privilegio para `public` ni para `anon`, y con el
-- grant a `authenticated` que necesitan. Sigue en pie el trade deliberado de
-- `business_has_feature`: cualquier usuario con sesión puede preguntar si un
-- negocio tiene una feature, y eso revela el tier de plan de ese negocio y nada
-- más. La alternativa es una ruta de escritura que no puede comprobar su
-- propio límite.

-- ─── EL ROL, Y POR QUÉ `limit 1` NO ES UN ORDEN QUE FALTE ────────────────────
--
-- `20261014005756_business_members_business_user_unique` pone UNIQUE sobre
-- `(business_id, user_id)`: una persona es un miembro por negocio, y el alcance
-- sobre varias sucursales son varias filas en `business_member_locations`, no
-- varias membresías. Con esa restricción el predicado de esta función puede
-- devolver como mucho UNA fila, así que `limit 1` no esconde un "cualquiera de
-- las que encuentre": no hay cuál elegir.
--
-- OJO con el nombre: la función se llama como el enum. En la gramática,
-- `nombre('literal')` es la producción genérica de CAST, así que un literal sin
-- tipo no busca una función —busca una conversión a `business_member_role`— y
-- contesta `22P02`. Una columna uuid o un `::uuid` explícito sí resuelven a la
-- función, que es lo que hacen las policies de la §6.2. Un `rpc/
-- business_member_role` de PostgREST con el argumento como string JSON NO lo
-- hace: hay que castearlo en el cliente.
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

-- ─── EL PERMISO, Y POR QUÉ EL ROL SE PREGUNTA Y NO SE CALCULA ────────────────
--
-- El orden es la regla: primero que la membresía esté activa, después que la
-- sesión sea válida, y solo entonces decide el alcance el rol. La membresía
-- activa NO se vuelve a comprobar aquí: `member_role is null` ES esa
-- comprobación, hecha por la función que la escribió. Repetirla aquí sería
-- volver a escribir la regla en un segundo sitio, que es exactamente lo que la
-- revisión encontró.
--
-- La comprobación de que la sucursal es del negocio va PRIMERO y es para todos
-- los roles: `owner` y `manager` reciben el negocio entero, y el negocio entero
-- no incluye las sucursales del vecino.
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
    select m.id, m.session_ttl_hours, m.last_authenticated_at
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
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

-- ─── EL CATÁLOGO DE PLANES ───────────────────────────────────────────────────
--
-- La fuente de verdad de este `case` es el §4.5 del spec
-- (`docs/superpowers/specs/2026-10-13-business-staff-access-design.md`), y de ahí
-- pasará a `BUSINESS_PLAN_FEATURES` en
-- `packages/commons/src/business/enums/business-plan.ts`, que es el archivo que
-- la va a escribir la tarea de contratos y el que este `case` tiene que seguir
-- en el mismo commit. Ese archivo todavía NO existe: el catálogo vive en el
-- spec, y por eso el puntero de acá es el spec y no un import que no se puede
-- resolver todavía.
--
-- El `else false` final es por el enum, no por descuido: si mañana se agrega un
-- plan, un plan nuevo no otorga features por accidente mientras alguien decide
-- cuánto cuesta cada una.
create or replace function public.business_has_feature(p_business_id uuid, p_feature public.business_feature)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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

-- La firma cambia: `(p_business_id uuid default null)`. Un `create or replace`
-- con otro aridad NO reemplaza la función sin argumentos, la deja al lado, y
-- entonces `session_state()` sin argumento se vuelve ambiguo entre las dos. Por
-- eso el drop va antes, y el test del ACL cuenta las filas de `pg_proc`: una
-- sobrecarga vieja es un error de gramática esperando a ocurrir.
drop function if exists public.business_member_session_state();

-- ─── LA EXPLICACIÓN, Y POR QUÉ EL ARGUMENTO ES OPCIONAL ──────────────────────
--
-- Sin argumento solo es honesto cuando la persona tiene UN negocio. El dueño
-- real tiene varios —en producción seis—, y elegir la fila más vieja devuelve
-- el negocio equivocado sin avisar. Con más de una membresía activa la función
-- no elige: dice `multiple_businesses` y devuelve la lista para que la app
-- pregunte.
--
-- `business_ids` describe los negocios DE ESTA RESPUESTA: el que se pasó
-- explícitamente, o todos los activos cuando la llamada no trajo ninguno.
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

-- El mismo perímetro que en 20261015001857, con `business_member_role` adentro:
-- las policies de la §6.2 la llaman por su nombre y las evalúa el motor como
-- `authenticated`. Devuelve el rol del QUE PREGUNTA —lee `auth.uid()`— y nada
-- más, así que no hay razón de privacidad para quitársela al cliente; lo que
-- había era una premisa falsa sobre qué función era interna.
revoke all on function public.business_member_role(uuid) from public, anon;
revoke all on function public.can_manage_location(uuid, uuid) from public, anon;
revoke all on function public.business_has_feature(uuid, public.business_feature) from public, anon;
revoke all on function public.business_member_session_state(uuid) from public, anon;

grant execute on function public.business_member_role(uuid) to authenticated;
grant execute on function public.can_manage_location(uuid, uuid) to authenticated;
grant execute on function public.business_has_feature(uuid, public.business_feature) to authenticated;
grant execute on function public.business_member_session_state(uuid) to authenticated;
