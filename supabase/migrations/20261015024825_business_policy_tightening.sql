-- ─────────────────────────────────────────────────────────────────────────────
-- Las policies que resuelven por rol también respetan la sesión, y tres de ellas
-- se aprietan
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- Son tres arreglos que van en una sola migración porque los tres reescriben el
-- grupo de policies y definirlas una vez evita que una quede con la forma vieja.
--
-- ─── 1. EL TTL NO LLEGABA A LAS QUE RESUELVEN POR ROL ───────────────────────
--
-- El encabezado de `20261015015012` afirma que la comprobación de sesión aplica
-- a TODOS los roles, dueño y gerente incluidos. Era verdad para las siete tablas
-- que pasan por `can_manage_location`, que sí tiene el TTL, y FALSA para las que
-- resuelven por `business_member_role`, que no lo tiene: su cuerpo es
--
--   select m.role from public.business_members m
--   where m.business_id = p_business_id and m.user_id = auth.uid()
--     and m.deleted_at is null and m.status = 'active' limit 1
--
-- y no hay rama de expiración en ninguna parte. O sea que un dueño o un gerente
-- con la sesión vencida seguía entrando a `business_hours` y a `coupons` —las
-- dos `FOR ALL`—, seguía actualizando la fila del negocio, seguía escribiendo
-- preferencias de notificación, seguía leyendo `payouts`, seguía creando
-- sucursales y seguía listando el equipo con sus alias.
--
-- El arreglo NO es poner el TTL dentro de `business_member_role`, y es a
-- propósito: esa función se dejó sin TTL en la Task 4 para que
-- `business_member_session_state` pueda decir `role: 'staff'` junto con
-- `reason: 'session_expired'`. El panel necesita el rol precisamente para poder
-- explicar la salida. Si el rol se fuera a cero con la sesión vencida, el panel
-- ya no tendría nada que explicar.
--
-- Entonces va un helper AL LADO, que contesta otra pregunta: "¿esta sesión está
-- viva para este negocio?". Las policies lo llaman ADEMÁS de su chequeo de rol,
-- así que una sesión vencida no entra por ninguna parte y el panel sigue
-- pudiendo decir por qué.
--
-- ─── 2. LA ARITMÉTICA DEL TTL, EN UN SOLO SITIO ─────────────────────────────
--
-- La regla es la que ya usan `can_manage_location` y
-- `business_member_session_state`: vencido es `ttl > 0` y (sin sello, o con el
-- sello más viejo que `ttl` horas). Vive en
-- `public.business_member_session_expires_at`, que devuelve la fecha de
-- vencimiento o `null` si no hay. Es la única cuenta, y
-- `business_member_session_valid` la consulta una vez por fila y le pregunta a
-- ese único valor las dos cosas — si existe y si ya pasó — en vez de repetir la
-- aritmética, que es el modo de falla que `business_member_session_state` ya
-- corrigió una vez cuando se le escapó una copia.
--
-- ─── 3. `deleted_at is null`, QUE EL §6.3 PIDE Y LAS POLICIES NO HACÍAN ──────
--
-- El §6.3 dice que toda lectura de membresías filtra las filas borradas, y nombra
-- estas dos policies. Ninguna de las dos lo hacía sobre la fila que están
-- leyendo: `Owners and managers view business members` no filtraba nada, y
-- `Owners and managers view member scope` filtraba el `deleted_at` de la fila
-- AJENA dentro del `exists` y nada sobre la de `business_member_locations` que
-- estaba listando.
--
-- Esto viene del brief, que traía el SQL de estas dos policies escrito así y
-- seguido al pie de la letra; la falta estaba señalada en el encabezado de
-- `20261015015012` y aquí queda cerrada.
--
-- El costo era de DIVULGACIÓN, no de acceso: una fila dada de baja no concede
-- nada por ningún camino, eso ya lo miden los helpers. Lo que pasaba es que un
-- alias —que espeja el correo de `auth.users`— seguía en la lista del equipo, y
-- que las filas de alcance borradas seguían a la vista.
--
-- ─── 4. BORRAR SUCURSAL ES COSA DE DUEÑO, NO DE GERENTE ─────────────────────
--
-- El §5.1 define el contrato del helper como `manager → todo el negocio,
-- excepto borrar sucursales`, y `20261015015012:126` le dejó la policy con
-- `can_manage_location`, que devuelve true para el gerente. Se aprieta a `owner`.
--
-- No es una regresión sino un retorno: la policy vieja que ésta reemplaza
-- (`business_ownership`) era de dueño solamente, así que un gerente que borraba
-- una sucursal antes de `20261015015012` tampoco podía. Y `business_member_
-- locations_location_id_fkey` es `ON DELETE CASCADE`, con lo cual hoy un gerente
-- que borra una sucursal se lleva por delante cada fila de alcance de cada
-- cajero que apuntaba a ella. Después del drop de `business_ownership` esta
-- policy es el único camino a `DELETE FROM business_locations` que tiene el
-- sistema.
--
-- ─── LO QUE NO SE TOCA ──────────────────────────────────────────────────────
--
-- `business_member_role`, `can_manage_location` y `business_member_session_state`
-- quedan exactamente como estaban, incluido el TTL de los dos últimos. Las
-- policies por ubicación no se mueven: ya tenían el TTL. Y
-- `Members can view own membership` tampoco: es la lectura de la fila propia,
-- no concede nada sobre el negocio, y un panel al que le acaba de vencer la
-- sesión necesita poder leerla para poder explicar la salida.

-- ─── EL HELPER NUEVO ─────────────────────────────────────────────────────────

create or replace function public.business_member_session_expires_at(
  p_session_ttl_hours integer,
  p_last_authenticated_at timestamptz
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  -- `null` significa "no hay fecha de vencimiento", y hay dos motivos que no
  -- son el mismo: el TTL está apagado (`= 0`, el modo equipo propio del §9.2) y
  -- la membresía nunca tuvo sello. El segundo lo cuenta
  -- `business_member_session_valid` aparte, porque para el que explica es
  -- `session_never_stamped` y para el que autoriza es denegar igual.
  select case
    when p_session_ttl_hours > 0 and p_last_authenticated_at is not null
      then p_last_authenticated_at + (p_session_ttl_hours * interval '1 hour')
    else null
  end;
$$;

revoke all on function public.business_member_session_expires_at(integer, timestamptz)
  from public, anon;
grant execute on function public.business_member_session_expires_at(integer, timestamptz)
  to authenticated;

create or replace function public.business_member_session_valid(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select public.business_member_session_expires_at(
             mm.session_ttl_hours, mm.last_authenticated_at
           ) as expires_at,
           mm.session_ttl_hours,
           mm.last_authenticated_at
    from public.business_members mm
    where mm.business_id = p_business_id
      and mm.user_id = auth.uid()
      -- Las mismas dos condiciones que usa `can_manage_location`, y por el mismo
      -- motivo: una fila dada de baja no es una membresía, y una deshabilitada
      -- es un negocio en el que no se puede actuar.
      and mm.deleted_at is null
      and mm.status = 'active'
    limit 1
  )
  select coalesce((
    select not (
      -- Las dos mitades de "vencida", sobre un valor calculado UNA vez. Sin
      -- membresía activa el `coalesce` responde false, que es lo que quiere el
      -- que autoriza: sin membresía no hay sesión que esté viva.
      (m.expires_at is not null and m.expires_at < now())
      or (m.session_ttl_hours > 0 and m.last_authenticated_at is null)
    )
    from m
  ), false);
$$;

revoke all on function public.business_member_session_valid(uuid) from public, anon;
grant execute on function public.business_member_session_valid(uuid) to authenticated;

-- ─── LAS POLICIES POR ROL, CON SESIÓN ───────────────────────────────────────

drop policy "Members can view business" on public.businesses;
create policy "Members can view business"
  on public.businesses for select to authenticated
  using (public.business_member_role(id) in ('owner', 'manager')
         and public.business_member_session_valid(id));

drop policy "Members can update business" on public.businesses;
create policy "Members can update business"
  on public.businesses for update to authenticated
  using (public.business_member_role(id) in ('owner', 'manager')
         and public.business_member_session_valid(id))
  with check (public.business_member_role(id) in ('owner', 'manager')
              and public.business_member_session_valid(id));

-- Crear sucursales es de dueño y gerente, y ahora además con la sesión viva.
drop policy "Members can insert business locations" on public.business_locations;
create policy "Members can insert business locations"
  on public.business_locations for insert to authenticated
  with check (public.business_member_role(business_id) in ('owner', 'manager')
              and public.business_member_session_valid(business_id));

drop policy "Members can manage business hours" on public.business_hours;
create policy "Members can manage business hours"
  on public.business_hours for all to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager')
         and public.business_member_session_valid(business_id))
  with check (public.business_member_role(business_id) in ('owner', 'manager')
              and public.business_member_session_valid(business_id));

drop policy "Members can manage coupons" on public.coupons;
create policy "Members can manage coupons"
  on public.coupons for all to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager')
         and public.business_member_session_valid(business_id))
  with check (public.business_member_role(business_id) in ('owner', 'manager')
              and public.business_member_session_valid(business_id));

drop policy "Members can view own payouts" on public.payouts;
create policy "Members can view own payouts"
  on public.payouts for select to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager')
         and public.business_member_session_valid(business_id));

drop policy "Members can view own notification preferences" on public.business_notification_preferences;
create policy "Members can view own notification preferences"
  on public.business_notification_preferences for select to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager')
         and public.business_member_session_valid(business_id));

drop policy "Members can insert own notification preferences" on public.business_notification_preferences;
create policy "Members can insert own notification preferences"
  on public.business_notification_preferences for insert to authenticated
  with check (public.business_member_role(business_id) in ('owner', 'manager')
              and public.business_member_session_valid(business_id));

drop policy "Members can update own notification preferences" on public.business_notification_preferences;
create policy "Members can update own notification preferences"
  on public.business_notification_preferences for update to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager')
         and public.business_member_session_valid(business_id))
  with check (public.business_member_role(business_id) in ('owner', 'manager')
              and public.business_member_session_valid(business_id));

-- ─── LAS TRES POLICIES DE LECTURA DE LAS TABLAS DE ACCESO ───────────────────
--
-- `deleted_at is null` sobre la fila que se ESTÁ LEYENDO, que es lo que el
-- §6.3 pide y lo que ninguna de las dos hacía. La de `business_members` no
-- filtra nada más: no hay fila ajena, la fila es la del negocio entero que se
-- está listando.
--
-- Y las dos preguntan por la sesión del negocio de la fila, que es el mismo
-- criterio que usa el resto: una sesión vencida no lista el equipo ni sus
-- alias.

drop policy "Owners and managers view business members" on public.business_members;
create policy "Owners and managers view business members"
  on public.business_members for select to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager')
         and public.business_member_session_valid(business_id)
         and deleted_at is null);

drop policy "Owners and managers view member scope" on public.business_member_locations;
create policy "Owners and managers view member scope"
  on public.business_member_locations for select to authenticated
  using (exists (
    select 1 from public.business_members m
    where m.id = member_id
      and m.deleted_at is null
      and public.business_member_role(m.business_id) in ('owner', 'manager')
      and public.business_member_session_valid(m.business_id)
  ) and deleted_at is null);

-- ─── BORRAR SUCURSAL, DE DUEÑO ──────────────────────────────────────────────

drop policy "Members can delete business locations" on public.business_locations;
create policy "Members can delete business locations"
  on public.business_locations for delete to authenticated
  using (public.business_member_role(business_id) = 'owner'
         and public.can_manage_location(business_id, id));