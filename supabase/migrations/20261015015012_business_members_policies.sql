-- ─────────────────────────────────────────────────────────────────────────────
-- Las policies resuelven por membresía, y los tres RPCs dejan de buscar al dueño
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── QUÉ HACE, Y POR QUÉ NO RETIRA NADA ──────────────────────────────────────
--
-- Crea el segundo juego de policies de negocio —el que resuelve por
-- `business_members`— y deja el primero, el de `business_ownership`, exactamente
-- como estaba. Es el paso 5 del orden del §6.2: nuevo primero, viejo después.
-- Las dos mitades conviven y las dos conceden, porque las policies permisivas se
-- unen con OR: el dueño conserva el acceso que ya tenía y encima gana el camino
-- nuevo. Al revés de este orden el dueño se queda sin panel.
--
-- El retiro de `business_ownership` es la migración SIGUIENTE, y no esta. Aquí no
-- se borra ni una policy vieja, ni un trigger, ni la tabla.
--
-- ─── POR QUÉ `can_manage_location` Y NO UNA COMPROBACIÓN DE ROL ───────────────
--
-- Las tablas que tienen columna de sucursal —`business_locations`, `offers`,
-- `orders`, y las que se resuelven a través de un pedido o de una oferta— se
-- conceden por `can_manage_location(business_id, location_id)`, que es la
-- ÚNICA definición de "administro esta sucursal" y ya aplica las tres reglas
-- que una comprobación escrita a mano tendría que volver a escribir bien: que la
-- sucursal sea del negocio, que la membresía no esté dada de baja ni pausada, y
-- que la sesión no haya vencido. El TTL va para TODOS los roles, dueño y gerente
-- incluidos: una policy que mirara `business_member_role` solo le daría a un
-- dueño con la sesión vencida un acceso que el helper le negaría.
--
-- El helper además COMPRUEBA que la sucursal sea del negocio, y eso importa más
-- de lo que parece: esta API escribe con `service_role`, que no pasa por RLS, así
-- que la última frontera de "esta sucursal es de este negocio" es esta llamada y
-- no hay otra detrás.
--
-- Las tablas SIN columna de sucursal —`businesses`, `business_hours`, `coupons`,
-- `payouts`, `business_notification_preferences`— se conceden por
-- `business_member_role(business_id) in ('owner', 'manager')`, que es la forma
-- que la Spec quiere para ellas y no un atajo: son ajustes del negocio entero, y
-- un cajero con una sucursal no los administra. Nótese que `businesses` está en
-- esa lista y no en la otra: la fila del negocio no tiene sucursal que acotar.
--
-- ─── POR QUÉ `TO authenticated` Y LAS VIEJAS A `public` ───────────────────────
--
-- Ninguna sesión anónima puede pasar el predicado: para tener fila en
-- `business_members` hace falta `user_id = auth.uid()`, y una sesión sin JWT no
-- tiene `auth.uid()`. Así que `TO authenticated` no le quita nada a nadie y sí
-- deja claro a quién pertenece cada capa.
--
-- ─── EL INSERT DE `business_locations`, Y POR QUÉ NO ES IGUAL QUE LOS demás ──
--
-- Las otras cuatro policies de esa tabla llaman a `can_manage_location(business_id,
-- id)`, y ahí `id` es una fila que ya existe. En un INSERT no existe todavía, así
-- que el helper responde que no y el panel se queda sin poder crear una sucursal
-- —que es una de las dos cosas que sí escribe directo a Supabase (§6.3)—. Por eso
-- el INSERT es una policy aparte y por rol: crear sucursales es de dueño y gerente.
--
-- ─── LOS TRES RPCs ───────────────────────────────────────────────────────────
--
-- `cancel_order`, `set_order_status` y `validate_pickup_code` comprobaban al
-- dueño con un `exists` escrito a mano sobre `business_ownership`. Se recrean con
-- el helper, y NO se cambia nada más: la matriz de estados, los códigos de error,
-- el orden en que se comprueba el permiso y la reposición de stock son lo que son
-- y hay clientes que ramifican sobre ellos.
--
-- Se recrean con `create or replace`, nunca con `drop` + `create`: `replace`
-- conserva el ACL y un `create` de nuevo devolvería la función a EXECUTE para
-- `PUBLIC`, que es un agujero en una función que cancela pedidos. Por lo mismo
-- esta migración no lleva NI UN `grant` NI UN `revoke` sobre estas tres: su ACL se
-- conserva solo, y `business-members.rls.db.spec.ts` lo asserta.
--
-- MEDIDO en la base viva antes de escribir esto, porque el brief decía otra cosa:
-- `anon` NO tiene EXECUTE ni en `cancel_order` ni en `reserve_offer`.
-- `20260906125927_harden_rpc_grants` se lo quitó y el ledger lo deja claro. Lo que
-- hay es `authenticated` y `service_role` en las cuatro. Conservar lo que hay es
-- el objetivo; cambiarlo sería la outage de otra feature.
--
-- ─── LAS TRES POLICIES DE LECTURA DE LAS TABLAS DE ACCESO ────────────────────
--
-- El cliente lee memberships y no las escribe (§6.3), y no existía ninguna policy
-- de lectura: sin ella, el panel no tenía nada que leer. No hay policy de INSERT,
-- UPDATE ni DELETE en ninguna de las dos tablas, y esa ausencia es la que frena la
-- escritura, que es justo lo que RLS sabe hacer.
--
-- Una nota que queda escrita porque el §6.3 dice "toda lectura de membresías filtra
-- `deleted_at is null`" y la policy de dueño y gerente, escrita como está en el
-- plan, NO lo filtra sobre la fila que lista: filtra `deleted_at is null` sobre la
-- fila AJENA, dentro del `exists` de `business_member_locations`. Se sigue el SQL
-- del plan al pie de la letra. Lo que sale de ahí no es un acceso —la fila borrada
-- no concede nada por ningún camino, y eso ya lo miden los helpers— sino una fila
-- de más en la lista del equipo. Quien decida cerrarlo, cierra las dos policies
-- de una vez y actualiza la aserción que mide la lista.

-- ─────────────────────────────────────────────────────────────────────────────
-- LAS POLICIES DE NEGOCIO
-- ─────────────────────────────────────────────────────────────────────────────

-- La fila del negocio. Sin columna de sucursal, así que por rol: el dueño y el
-- gerente administran el negocio entero, y el cajero no.
create policy "Members can view business"
  on public.businesses for select to authenticated
  using (public.business_member_role(id) in ('owner', 'manager'));

create policy "Members can update business"
  on public.businesses for update to authenticated
  using (public.business_member_role(id) in ('owner', 'manager'))
  with check (public.business_member_role(id) in ('owner', 'manager'));

-- Sucursales: leer y modificar por ubicación, crear por rol. Ver la nota de arriba
-- sobre por qué INSERT no puede usar el helper.
create policy "Members can view business locations"
  on public.business_locations for select to authenticated
  using (public.can_manage_location(business_id, id));

create policy "Members can insert business locations"
  on public.business_locations for insert to authenticated
  with check (public.business_member_role(business_id) in ('owner', 'manager'));

create policy "Members can update business locations"
  on public.business_locations for update to authenticated
  using (public.can_manage_location(business_id, id))
  with check (public.can_manage_location(business_id, id));

create policy "Members can delete business locations"
  on public.business_locations for delete to authenticated
  using (public.can_manage_location(business_id, id));

-- Ofertas. `business_location_id` no es nullable y `trg_set_order_business_location`
-- deriva la del pedido, así que un INSERT aquí siempre tiene una sucursal real que
-- el helper puede comprobar.
create policy "Members can view own offers"
  on public.offers for select to authenticated
  using (public.can_manage_location(business_id, business_location_id));

create policy "Members can insert own offers"
  on public.offers for insert to authenticated
  with check (public.can_manage_location(business_id, business_location_id));

create policy "Members can update own offers"
  on public.offers for update to authenticated
  using (public.can_manage_location(business_id, business_location_id))
  with check (public.can_manage_location(business_id, business_location_id));

create policy "Members can delete own offers"
  on public.offers for delete to authenticated
  using (public.can_manage_location(business_id, business_location_id));

-- Pedidos: solo lectura, como siempre. Nacen en `reserve_offer` y los escriben
-- los RPCs cerrados, así que una policy de escritura aquí sería además inútil.
create policy "Members can view own orders"
  on public.orders for select to authenticated
  using (public.can_manage_location(business_id, business_location_id));

-- El log de eventos y los intents de pago heredan la sucursal del pedido.
create policy "Members can view own order events"
  on public.order_events for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_events.order_id
      and public.can_manage_location(o.business_id, o.business_location_id)
  ));

create policy "Members can view own payment intents"
  on public.payment_intents for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = payment_intents.order_id
      and public.can_manage_location(o.business_id, o.business_location_id)
  ));

-- El cliente de un pedido de la sucursal, y solo ese.
create policy "Members can view their order customers"
  on public.profiles for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.user_id = profiles.id
      and public.can_manage_location(o.business_id, o.business_location_id)
  ));

-- La categoría de una oferta se administra con la oferta.
create policy "Members can insert offer categories"
  on public.offer_categories for insert to authenticated
  with check (exists (
    select 1 from public.offers o
    where o.id = offer_categories.offer_id
      and public.can_manage_location(o.business_id, o.business_location_id)
  ));

create policy "Members can delete offer categories"
  on public.offer_categories for delete to authenticated
  using (exists (
    select 1 from public.offers o
    where o.id = offer_categories.offer_id
      and public.can_manage_location(o.business_id, o.business_location_id)
  ));

-- Horarios, cupones, pagos y preferencias: configuración del negocio entero. Sin
-- columna de sucursal, así que por rol.
create policy "Members can manage business hours"
  on public.business_hours for all to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager'))
  with check (public.business_member_role(business_id) in ('owner', 'manager'));

create policy "Members can manage coupons"
  on public.coupons for all to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager'))
  with check (public.business_member_role(business_id) in ('owner', 'manager'));

create policy "Members can view own payouts"
  on public.payouts for select to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager'));

create policy "Members can view own notification preferences"
  on public.business_notification_preferences for select to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager'));

create policy "Members can insert own notification preferences"
  on public.business_notification_preferences for insert to authenticated
  with check (public.business_member_role(business_id) in ('owner', 'manager'));

create policy "Members can update own notification preferences"
  on public.business_notification_preferences for update to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager'))
  with check (public.business_member_role(business_id) in ('owner', 'manager'));

-- ─────────────────────────────────────────────────────────────────────────────
-- LAS TRES POLICIES DE LECTURA DE LAS TABLAS DE ACCESO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- El cliente solo lee (§6.3). La escritura no tiene policy, y no es que se le
-- haya olvidado: es lo que la frena.

create policy "Members can view own membership"
  on public.business_members for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

create policy "Owners and managers view business members"
  on public.business_members for select to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager'));

create policy "Owners and managers view member scope"
  on public.business_member_locations for select to authenticated
  using (exists (
    select 1 from public.business_members m
    where m.id = member_id
      and m.deleted_at is null
      and public.business_member_role(m.business_id) in ('owner', 'manager')
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- LOS TRES RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- Cancelar. Lo único que cambia es QUIÉN puede: la sucursal del pedido, a través
-- del helper, en vez de "soy el dueño del negocio". La matriz —se cancela desde
-- `pending`, `confirmed` y `ready_for_pickup`, y solo desde ahí— y el reordenamiento
-- de stock son los de siempre.
create or replace function public.cancel_order(
  p_user_id uuid default null,
  p_order_id uuid default null,
  p_business_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  -- Ruta consumidor: p_user_id debe ser el caller autenticado (la ruta negocio
  -- valida la sucursal con can_manage_location; service_role: uid null).
  if p_user_id is not null and auth.uid() is not null
     and p_user_id is distinct from auth.uid() then
    return jsonb_build_object(
      'success', false, 'error', 'NOT_ORDER_OWNER',
      'message', 'No eres el dueño de este pedido'
    );
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false, 'error', 'ORDER_NOT_FOUND',
      'message', 'Pedido no encontrado'
    );
  end if;

  -- Actor: negocio que administra la sucursal del pedido (p_business_id) o
  -- consumidor dueño (p_user_id). El helper también rechaza la sucursal de otro
  -- negocio, que es el otro camino por el que un negocio se lleva el pedido ajeno.
  if p_business_id is not null then
    if not public.can_manage_location(p_business_id, v_order.business_location_id)
       or v_order.business_id != p_business_id then
      return jsonb_build_object(
        'success', false, 'error', 'NOT_ORDER_OWNER',
        'message', 'No eres el dueño de este pedido'
      );
    end if;
  else
    if p_user_id is null or v_order.user_id != p_user_id then
      return jsonb_build_object(
        'success', false, 'error', 'NOT_ORDER_OWNER',
        'message', 'No eres el dueño de este pedido'
      );
    end if;
  end if;

  if v_order.status not in ('pending', 'confirmed', 'ready_for_pickup') then
    return jsonb_build_object(
      'success', false, 'error', 'CANNOT_CANCEL',
      'message', 'Este pedido no se puede cancelar'
    );
  end if;

  update public.orders
  set status = 'cancelled',
      updated_at = now()
  where id = p_order_id;

  update public.offers
  set stock = stock + 1
  where id = v_order.offer_id;

  -- order_events es creado por el trigger on_order_status_change (evita duplicado)
  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'cancelled'
  );
end;
$$;

-- Mover un pedido por su ciclo. La matriz de transiciones, la fila que reserva
-- `picked_up`/`completed`/`expired` al sistema y la reposición de stock al cancelar
-- son exactamente las de antes.
create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_status public.order_status;
  v_is_admin boolean;
  v_is_owner boolean;
begin
  select exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'order_status' and e.enumlabel = p_status
  ) into v_is_admin;
  if not v_is_admin then
    return jsonb_build_object('success', false, 'error', 'INVALID_STATUS', 'message', 'Estado inválido');
  end if;
  v_status := p_status::public.order_status;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND', 'message', 'Pedido no encontrado');
  end if;

  v_is_admin := auth_helpers.my_role() = 'admin';
  -- El permiso es de la sucursal del pedido, no del negocio entero: un cajero
  -- mueve los pedidos de su alcance y el pedido del negocio vecino no existe para
  -- él, que es justo lo que el `exists` viejo no distinguía.
  v_is_owner := public.can_manage_location(v_order.business_id, v_order.business_location_id);

  if not (v_is_owner or v_is_admin) then
    return jsonb_build_object('success', false, 'error', 'NOT_ORDER_OWNER', 'message', 'No eres el dueño de este pedido');
  end if;

  if v_order.status = v_status then
    return jsonb_build_object('success', false, 'error', 'INVALID_TRANSITION', 'message', 'El pedido ya está en ese estado');
  end if;

  -- Matriz del ciclo de vida (espejo de canTransitionTo en mobile/commons)
  if not (
    (v_order.status = 'pending' and v_status in ('confirmed', 'cancelled', 'expired')) or
    (v_order.status = 'confirmed' and v_status in ('ready_for_pickup', 'cancelled', 'expired')) or
    (v_order.status = 'ready_for_pickup' and v_status in ('picked_up', 'completed', 'cancelled', 'expired')) or
    (v_order.status = 'picked_up' and v_status = 'completed')
  ) then
    return jsonb_build_object('success', false, 'error', 'INVALID_TRANSITION', 'message', 'Transición de estado no permitida');
  end if;

  -- El negocio solo opera hasta ready_for_pickup/cancel: la entrega exige
  -- el pickup code (validate_pickup_code) y expired lo fija el sistema.
  if not v_is_admin and v_status in ('picked_up', 'completed', 'expired') then
    return jsonb_build_object('success', false, 'error', 'INVALID_TRANSITION', 'message', 'Transición reservada al sistema');
  end if;

  update public.orders
  set status = v_status,
      updated_at = now()
  where id = p_order_id;

  -- Cancelar repone stock (misma semántica que cancel_order). Los
  -- order_events los crea el trigger on_order_status_change.
  if v_status = 'cancelled' then
    update public.offers set stock = stock + 1 where id = v_order.offer_id;
  end if;

  return jsonb_build_object('success', true, 'order_id', p_order_id, 'status', v_status);
end;
$$;

-- Validar la recogida. El permiso se comprueba PRIMERO y sobre la sucursal del
-- pedido, así que un pedido que no existe y un pedido ajeno devuelven el mismo
-- `UNAUTHORIZED` que devolvían antes: un cliente que ramifica sobre el código
-- depende de ese orden.
create or replace function public.validate_pickup_code(p_order_id uuid, p_pickup_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
begin
  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id
      and public.can_manage_location(o.business_id, o.business_location_id)
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'No tienes permiso para validar este pedido'
    );
  end if;

  -- Lock and get the order
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'ORDER_NOT_FOUND',
      'message', 'Pedido no encontrado'
    );
  end if;

  -- Validate pickup code
  if v_order.pickup_code <> p_pickup_code then
    return jsonb_build_object(
      'success', false,
      'error', 'INVALID_CODE',
      'message', 'Código de recogida inválido'
    );
  end if;

  -- Validate status is ready_for_pickup
  if v_order.status <> 'ready_for_pickup' then
    return jsonb_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'El pedido no está listo para recoger'
    );
  end if;

  -- Update order status
  update public.orders
  set status = 'completed',
      updated_at = now()
  where id = p_order_id;

  -- order_events es creado por el trigger on_order_status_change (evita duplicado)

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'completed'
  );
end;
$$;