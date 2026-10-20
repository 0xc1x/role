-- ─────────────────────────────────────────────────────────────────────────────
-- La frontera de sucursal, en las policies
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- Son TRES cambios, y el diff es de UN predicado y DOS policies:
--
--   1. `can_manage_location` deja de darle el negocio entero al `manager`.
--   2. `business_member_reaches_member` gana la excepción de la PROPIA fila.
--   3. Las dos policies del roster pasan a ser «el roster que alcanzas».
--
-- ─── LA REGLA, EN UNA FRASE ──────────────────────────────────────────────────
--
-- **El dueño alcanza todo el negocio; un `manager` o un `staff` alcanzan
-- exactamente la unión de las sucursales de sus filas vivas de
-- `business_member_locations`; y sin filas no alcanzan NADA.** Y aplica a
-- lecturas y a escrituras, que es lo que cambia respecto de hoy: hoy el
-- `manager` recibía el negocio entero, y las lecturas iban con las
-- escrituras.
--
-- Es la MISMA regla que ya vive en `business_member_reaches_member` —la
-- migración anterior la puso en la base y la API la consulta—, así que acá no
-- se escribe una segunda: se le cambia la respuesta a la pregunta que las
-- policies ya hacen.
--
-- ─── POR QUÉ UNA MIGRACIÓN Y NO CATORCE ──────────────────────────────────────
--
-- Las TRECE policies que pasan por `can_manage_location` leen la respuesta de
-- la función, así que lo que cambia es lo que la función contesta, y por eso
-- el diff es de un predicado y no de trece. Un plan con trece diffs de policy
-- y uno con un predicado son el mismo plan, y el segundo es el que un
-- revisor puede leer de un tirón: en el primero hay que reconstruir la regla
-- trece veces y comprobar que las trece dicen lo mismo.
--
-- Y las TRECE no se tocan porque no hace falta: la frontera entra por la
-- FUNCIÓN, que es el único sitio donde está escrita.
--
-- ─── LO QUE NO SE TOCA, Y POR QUÉ ───────────────────────────────────────────
--
-- Las nueve policies de negocio entero —la fila del negocio, los horarios, los
-- cupones, las liquidaciones, las preferencias de notificación y el alta de
-- sucursales— siguen siendo de negocio entero. La regla del alcance acota LAS
-- COSAS QUE VIVEN EN UNA SUCURSAL: lo que no tiene dimensión de sucursal
-- sigue siendo del negocio entero, y se concede por el ROL.
--
-- Y no se toca `Members can delete business locations`, que exige
-- `role = 'owner'`: no le da alcance a nadie, así que no hay nada que acotar.
--
-- ─── LO QUE NO SE TOCA, Y POR QUÉ ES SEGURIDAD ───────────────────────────────
--
-- En producción hay 16 dueños y CERO gerentes y CERO empleados (medido el
-- 2026-10-21), así que el comportamiento de producción no se mueve con esta
-- migración: no hay a quién moverle el panel.
--
-- ─── EL ROL DENTRO DE LAS DOS POLICIES DEL ROSTER ───────────────────────────
--
-- La regla del alcance NO distingue por rol: un empleado con alcance {A}
-- alcanza a otro empleado con alcance {A}, y el helper lo dice. Si las dos
-- policies del roster se escribieran SÓLO con el helper, un empleado entraría
-- al roster y vería los alias —que espejan `auth.users.email`— de las personas
-- que administra.
--
-- Las dos policies se llaman «Owners and managers…» y se llaman así por algo:
-- el roster es de dueño y gerente. Así que el requisito de rol va DENTRO de
-- las dos, y la regla del alcance sigue siendo la regla del alcance.
--
-- ─── POR QUÉ `ALTER POLICY` Y NO `DROP` + `CREATE` ───────────────────────────
--
-- Postgres NO tiene `create or replace policy`. Reescribir una policy es
-- `alter policy … using (…)`, que conserva el OID y no la saca nunca de
-- `pg_policies`, o `drop policy` + `create policy`, que abre una ventana en la
-- que la policy no existe: en esa ventana la tabla queda abierta para el rol
-- que la policy restringía, y esa ventana no se ve en ningún log.
--
-- ─── LA EXCEPCIÓN DE LA PROPIA FILA ─────────────────────────────────────────
--
-- La decisión 4 del ADR-0013 —«un gerente puede pausarse a sí mismo, y es a
-- propósito»— choca con «sin filas de alcance no se alcanza NADA»: un gerente
-- sin filas no se alcanzaba a sí mismo, y con eso desaparecía el camino de
-- autoservicio.
--
-- La excepción vive en el HELPER, y no en la policy, por dos razones:
--
--   1. La API pregunta a la base (la migración anterior la dejó de decidir) y
--      la escritura de «pausarme» la hace la API. Si la excepción viviera sólo
--      en la policy, el helper seguiría diciendo que no y el camino de
--      autoservicio seguiría roto donde se usa.
--   2. Una policy no puede decir «MI fila» sin leer `business_members` con la
--      RLS del llamador —y una policy que lee `business_members` para
--      encontrar la fila del llamador recursiona— o sin una segunda función
--      `security definer`, que sería un segundo sitio con la regla.
--
-- Y es SÓLO la propia fila de membresía: no concede ni una sucursal, ni un
-- producto, ni un pedido. `can_manage_location` no se entera: la excepción
-- vive en el helper del roster, no en el del alcance.
--
-- ─── LA SESIÓN ──────────────────────────────────────────────────────────────
--
-- Las dos policies del roster ya no preguntan por la sesión: el helper lo
-- hace, y lo hace con el mismo reloj —`business_member_session_valid`— que
-- las policies que resuelven por rol. Por eso la llamada a
-- `business_member_session_valid` desaparece del texto de las dos, y no es
-- una pérdida: el helper es `security definer`, así que lee la fila sin la
-- RLS del llamador, y su respuesta es la de la sesión del que pregunta.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `can_manage_location`: EL DUEÑO LLEGA A TODO, EL GERENTE A SU ALCANCE
--
-- El único cambio es la rama del `manager`. Antes:
--
--   when r.member_role in ('owner', 'manager') then true
--
-- y ahora:
--
--   when r.member_role = 'owner' then true
--
-- El `manager` sigue llegando a la fila por la rama de abajo, que es la del
-- alcance: la sucursal está en las filas de `business_member_locations` de su
-- membresía. La fila de `manager` sin alcance cae en `false`, que es la regla
-- del plan: sin filas no se alcanza nada.
--
-- Y el dueño no necesita filas de alcance: su alcance es el negocio entero.
-- Esa rama va ANTES que la del alcance, y no después, porque el dueño no
-- tiene por qué tener filas.

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
      -- EL DUEÑO. Y SOLO EL DUEÑO.
      --
      -- Antes esta rama era `in ('owner', 'manager')`, y con ella el `manager`
      -- recibía el negocio entero: sus lecturas, sus escrituras y todo lo
      -- demás. Ahora el `manager` llega por la rama de abajo —la del
      -- alcance— y el dueño conserva el negocio entero, que es lo que su rol
      -- significa y lo que no necesita filas de alcance para tener.
      when r.member_role = 'owner' then true
      -- EL ALCANCE: la sucursal tiene que estar en las filas vivas de
      -- `business_member_locations` de ESTE miembro. Sin filas, no hay fila que
      -- case y la respuesta es `false`: sin alcance no se alcanza nada.
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

revoke all on function public.can_manage_location(uuid, uuid) from public, anon;
grant execute on function public.can_manage_location(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. `business_member_reaches_member`: + LA EXCEPCIÓN DE LA PROPIA FILA
--
-- El cuerpo es el de la migración anterior, con UNA rama más. La rama es la
-- del que llama: un miembro alcanza SIEMPRE su propia fila de membresía,
-- aunque no tenga alcance.
--
-- Va DESPUÉS de la del dueño —que ya llegaba a todo— y ANTES de la del
-- alcance vacío, que es la que negaba: sin esta rama, un gerente sin filas no
-- se alcanzaba a sí mismo y el camino de autoservicio del ADR-0013 (decisión
-- 4) desaparecía.
--
-- Y es sólo la PROPIA fila: el objetivo tiene que ser la membresía de quien
-- llama, no una cualquiera. La fila ajena sigue rigiéndose por la contención.

create or replace function public.business_member_reaches_member(
  p_business_id uuid,
  p_target_member_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    -- La fila del que llama. El ROL no sale de acá: sale de
    -- `business_member_role`, que es la única definición de «qué rol tiene esta
    -- persona en este negocio» —la razón está escrita en
    -- `20261015003929_business_member_permission_hardening.sql`—. Acá sólo se
    -- busca el identificador, para llegar a las filas de alcance.
    select m.id
    from public.business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.deleted_at is null
      and m.status = 'active'
    limit 1
  ),
  role_of as (
    select public.business_member_role(p_business_id) as member_role
  ),
  target as (
    -- El acceso que se pregunta. `deleted_at is null` porque un acceso dado de
    -- baja no es un acceso: no lo administra nadie, ni el dueño.
    select tm.id
    from public.business_members tm
    where tm.id = p_target_member_id
      and tm.business_id = p_business_id
      and tm.deleted_at is null
    limit 1
  ),
  caller_scope as (
    select l.location_id
    from public.business_member_locations l
    where l.member_id = (select c.id from caller c)
      and l.deleted_at is null
  ),
  target_scope as (
    select l.location_id
    from public.business_member_locations l
    where l.member_id = (select t.id from target t)
      and l.deleted_at is null
  )
  select coalesce((
    select case
      -- La sesión va PRIMERO: una sesión vencida no alcanza nada, y es la misma
      -- promesa que aplican las policies que resuelven por rol.
      when not public.business_member_session_valid(p_business_id) then false
      -- Un acceso de otro negocio, o dado de baja, no lo alcanza nadie.
      when (select t.id from target t) is null then false
      -- El dueño alcanza todo el negocio, y no necesita filas de alcance para
      -- eso: el alcance del dueño es el negocio entero.
      when r.member_role = 'owner' then true
      -- LA PROPIA FILA, y sólo la propia: un miembro alcanza su propia fila de
      -- membresía aunque no tenga alcance. Es la excepción del ADR-0013
      -- (decisión 4): un gerente puede cortar su propio acceso, y para eso
      -- tiene que poder leerse a sí mismo. Sin esta rama, un gerente SIN filas
      -- de alcance no se alcanzaba a sí mismo y el camino de autoservicio
      -- desaparecía.
      --
      -- NO concede ningún acceso más: la fila ajena sigue rigiéndose por la
      -- contención de más abajo, y el alcance de las sucursales lo contesta
      -- `can_manage_location`, que no sabe nada de esta excepción.
      when (select t.id from target t) = (select c.id from caller c) then true
      -- Sin filas de alcance no se alcanza NADA.
      when not exists (select 1 from caller_scope) then false
      -- Y un acceso sin alcance no lo administra nadie salvo el dueño: no toca
      -- ninguna sucursal, y no hay por dónde ampliarlo.
      when not exists (select 1 from target_scope) then false
      -- LA CONTENCIÓN, y no la intersección: no hay ninguna sucursal del
      -- alcance del objetivo que no esté en el alcance del que llama.
      when exists (
        select 1
        from target_scope ts
        where not exists (
          select 1
          from caller_scope cs
          where cs.location_id = ts.location_id
        )
      ) then false
      else true
    end
    from caller c
    cross join role_of r
  ), false);
$$;

revoke all on function public.business_member_reaches_member(uuid, uuid)
  from public, anon;
grant execute on function public.business_member_reaches_member(uuid, uuid)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LAS DOS POLICIES DEL ROSTER
--
-- `Owners and managers view business members` pasa a ser «el roster que
-- alcanzas»: la fila que se está leyendo tiene que ser una fila a la que el
-- que pregunta llega. Y el requisito de rol va DENTRO, porque la regla del
-- alcance no distingue por rol y sin él un empleado entraría al roster.
--
-- `Owners and managers view member scope` es lo mismo para las filas de
-- alcance: se ven las filas de los accesos que el que pregunta alcanza, y no
-- las de los demás.
--
-- Y las dos con `alter policy`, que conserva el OID: un `drop` + `create`
-- abriría una ventana en la que la policy no existe.

alter policy "Owners and managers view business members"
  on public.business_members
  using (
    -- EL ROL: el roster es de dueño y gerente. La regla del alcance no
    -- distingue por rol, así que sin esta mitad un empleado con alcance que
    -- cubre al de otro empleado entraría al roster y vería los alias —que
    -- espejan `auth.users.email`— de las personas que administra.
    public.business_member_role(business_id) in ('owner', 'manager')
    -- EL ALCANCE: la fila que se está leyendo tiene que ser una fila a la que
    -- el que pregunta llega. El helper es `security definer`, así que lee las
    -- membresías y las filas de alcance sin la RLS del llamador, y su
    -- respuesta es la del que pregunta.
    and public.business_member_reaches_member(business_id, id)
    -- Y la fila que se está LEYENDO, que es lo que pide el §6.3.
    and deleted_at is null
  );

alter policy "Owners and managers view member scope"
  on public.business_member_locations
  using (
    exists (
      select 1
      from public.business_members m
      where m.id = business_member_locations.member_id
        -- EL ROL, por la misma razón que en la policy de arriba: el alcance de
        -- una persona no la convierte en alguien que ve el roster.
        and public.business_member_role(m.business_id) in ('owner', 'manager')
        -- EL ALCANCE: las filas de alcance que se ven son las de los accesos
        -- que el que pregunta alcanza, y no las de los demás.
        and public.business_member_reaches_member(m.business_id, m.id)
    )
    -- Y la fila de alcance que se está LEYENDO, que es lo que pide el §6.3.
    and business_member_locations.deleted_at is null
  );