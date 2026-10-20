-- ─────────────────────────────────────────────────────────────────────────────
-- El alcance por sucursal es una regla de la base, y la API la consulta
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- Crea las dos funciones que contestan las dos preguntas del alcance, que hasta
-- ahora contestaba el servicio en TypeScript (`scopeIsContained`, en
-- `apps/api/src/modules/staff/staff.service.ts`):
--
--   business_member_reaches_member(business_id, member_id)      -> boolean
--   business_member_covers_locations(business_id, location_ids) -> boolean
--
-- LA REGLA, en una frase: **el dueño vivo del negocio alcanza a todo; cualquier
-- otro miembro alcanza lo que está dentro de su alcance, y su alcance tiene que
-- ser NO VACÍO para que alcance algo.** Y son tres mitades: (1) el dueño
-- alcanza todo y no necesita filas de alcance; (2) el alcance del que llama
-- tiene que ser no vacío, porque sin filas no se alcanza NADA, ni siquiera un
-- acceso sin alcance —el conjunto vacío es subconjunto de todo, y por eso la
-- versión escrita en TypeScript admitía a un gerente sin alcance a tocar
-- cualquier acceso sin alcance—; (3) el alcance del objetivo tiene que ser no
-- vacío Y estar contenido en el del que llama, porque un acceso sin alcance no
-- toca ninguna sucursal y no hay por dónde ampliarlo.
--
-- POR QUÉ NO SE TOCA NINGUNA POLICY: la frontera de sucursal llega a las
-- policies en la migración siguiente, que cambia `can_manage_location` y las
-- dos policies del roster. La regla tiene que existir en UN solo sitio antes de
-- que nadie la escriba en dos. Y no se toca ninguna policy por el otro motivo,
-- que es el que pesa: en producción hay 16 dueños y CERO gerentes y CERO
-- empleados (medido el 2026-10-21), así que el comportamiento de producción no
-- se mueve con esta migración.
--
-- LA CONTENCIÓN se calcula con `not exists` y no con el `&&` de `uuid[]`: un
-- predicado que se puede LEER es un predicado que se puede PROBAR, y la
-- mutación que convierte la contención en intersección tiene que romper la
-- suite.
--
-- LA SESIÓN: las dos funciones preguntan por `business_member_session_valid`, la
-- misma función que usan las policies que resuelven por rol, con la misma
-- aritmética de expiración (`business_member_session_expires_at`).
--
-- POR QUÉ `security definer` Y POR QUÉ `search_path = ''`: como las siete
-- funciones que ya existen. El `security definer` es lo que permite que una
-- policy las llame, porque sin él el helper leería `business_member_locations`
-- con la RLS del llamador y una policy que lee `business_member_locations`
-- RECURSA (`business_members` -> `business_member_locations` ->
-- `business_members`).
--
-- LOS PERMISOS, y por qué no son los mismos: `business_member_reaches_member`
-- se concede a `authenticated` porque la migración siguiente la pone en las dos
-- policies del roster, y una policy la evalúa el motor como el rol que la
-- invoca —sin este grant la policy nueva no concede NADA y el roster del
-- gerente se vacía—; es el mismo ACL que `can_manage_location` y
-- `business_member_role`. `business_member_covers_locations` NO se concede a
-- `authenticated`: la pregunta que contesta es la de la API, y no la de ninguna
-- policy.
--
-- ─── ¿ALCANZO A ESTE ACCESO? ─────────────────────────────────────────────────
--
-- La regla del `5.1 leída de lado del ACCESO: el dueño llega a todos los
-- accesos de su negocio, y cualquier otro miembro llega a un acceso si y sólo
-- si su alcance es no vacío, el alcance del acceso es no vacío, y el del acceso
-- está contenido en el suyo.
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

-- ─── ¿ESTAS SUCURSALES ESTÁN DENTRO DE MI ALCANCE? ──────────────────────────
--
-- La misma regla, leída de lado del CONJUNTO DE SUCURSALES: el dueño cubre
-- todo, y cualquier otro miembro cubre un conjunto no vacío de sucursales si
-- todas están en su alcance. Un conjunto vacío no lo cubre nadie salvo el
-- dueño.
--
-- El «conjunto vacío no lo cubre nadie salvo el dueño» es la mitad que hace
-- esta función distinta de la otra: un `true` ahí significaría que un gerente
-- sin alcance puede crear accesos sin alcance, o ampliar los que ya tiene a
-- ninguno.
create or replace function public.business_member_covers_locations(
  p_business_id uuid,
  p_location_ids uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    -- Igual que en la hermana: el identificador del que llama, y el rol sale
    -- de `business_member_role`.
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
  caller_scope as (
    select l.location_id
    from public.business_member_locations l
    where l.member_id = (select c.id from caller c)
      and l.deleted_at is null
  )
  select coalesce((
    select case
      when not public.business_member_session_valid(p_business_id) then false
      -- El dueño cubre todo, y el conjunto vacío también: para el dueño no hay
      -- nada que cubrir, y su alcance es el negocio entero.
      when r.member_role = 'owner' then true
      -- Un conjunto vacío no lo cubre nadie salvo el dueño.
      when coalesce(cardinality(p_location_ids), 0) = 0 then false
      -- Sin filas de alcance no se cubre ni una sucursal.
      when not exists (select 1 from caller_scope) then false
      -- Y TODAS las sucursales pedidas tienen que estar en el alcance: la
      -- contención es de conjunto, no «al menos una».
      when exists (
        select 1
        from unnest(p_location_ids) as requested(location_id)
        where not exists (
          select 1
          from caller_scope cs
          where cs.location_id = requested.location_id
        )
      ) then false
      else true
    end
    from caller c
    cross join role_of r
  ), false);
$$;

revoke all on function public.business_member_covers_locations(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.business_member_covers_locations(uuid, uuid[])
  to service_role;