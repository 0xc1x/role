-- ─────────────────────────────────────────────────────────────────────────────
-- La validación por código vuelve a decir en el registro que fue por código
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── QUÉ CORRIGE ─────────────────────────────────────────────────────────────
--
-- `20261015015012` le quitó a `validate_pickup_code` un `insert` manual en
-- `public.order_events`. acertó en el NÚMERO DE FILAS y se equivocó en lo que la
-- fila decía.
--
-- El bug de fondo era real y la corrección estaba bien: esa función insertaba el
-- evento a mano DESPUÉS del `update` del pedido, y ese `update` dispara
-- `on_order_status_change`, que es `AFTER INSERT OR UPDATE ... FOR EACH ROW` y
-- escribe el suyo. Como `order_events` no tiene ninguna unique más allá de su
-- `id`, cada recogida validada dejaba DOS eventos de "completado".
--
-- Lo que el `insert` quitado llevaba y el del trigger no es un duplicado
-- idéntico: el manual ponía `metadata = {"method": "pickup_code"}` y el del
-- trigger pone `metadata = {"source": "database"}`. El `changed_by` no se pierde
-- —los dos usan el `auth.uid()` del que llama—, pero el `method` no estaba en
-- ninguna otra parte. Sin esta migración, "¿cuántos pedidos se completaron por
-- código y cuántos los completó el negocio?" deja de tener respuesta en la tabla
-- de auditoría, y no queda rastro de que la tuviera.
--
-- ─── POR QUÉ UN UPDATE ACOTADO Y NO UN GUC ──────────────────────────────────
--
-- El trigger ya tiene un precedente para que el llamador anote lo que él
-- escribe: lee `current_setting('role.order_event_actor', true)`. La vía del GUC
-- pediría tocar `on_order_status_change`, que dispara en TODOS los inserts y
-- updates de `orders` —los de `reserve_offer` incluidos— y extendería el radio
-- de impacto de esta migración a un camino que no tiene nada que ver con recoger
-- un pedido. Un segundo `update`, acotado a la fila que esta misma llamada acaba
-- de producir, se queda dentro de la función que lo necesita.
--
-- ─── POR QUÉ ESE ALCANCE NO PUEDE COGER LA FILA DE OTRO ──────────────────────
--
-- El `where` pide cuatro cosas y las cuatro hacen falta:
--
--   order_id = p_order_id             el evento es de ESTE pedido
--   status = 'completed'              y es el de ESTE paso
--   metadata->>'source' = 'database'   lo escribió el trigger, no una mano
--   metadata->>'method' is null        y todavía no está anotado
--
-- Las dos últimas son de estilo; la que de verdad cierra el caso es la segunda,
-- por esto:
--
-- Para llegar a este `update` la función tiene que haber superado el chequeo de
-- estado de más arriba, y ese chequeo solo pasa con el pedido en
-- `ready_for_pickup`. A `completed` se llega desde `ready_for_pickup` o desde
-- `picked_up`, y las dos transiciones están reservadas al sistema en
-- `set_order_status` —la rama "Transición reservada al sistema" se lo impide a
-- quien no sea admin—, así que el único camino de negocio a `completed` es este
-- RPC. Si el pedido estaba en `ready_for_pickup` es que nunca estuvo en
-- `completed`, y entonces no puede haber un evento de `completed` anterior: el
-- único es el que el trigger acaba de escribir en la línea de arriba.
--
-- Además el pedido se bloquea con `for update` al principio de la función, así
-- que dos validaciones del mismo pedido no se intercalan.
--
-- ─── LO QUE NO SE TOCA ──────────────────────────────────────────────────────
--
-- La matriz de estados, el orden de los errores, los códigos, los mensajes y el
-- permiso por `can_manage_location` son los de `20261015015012`, y se conservan
-- igual: esto agrega una frase a una fila que ya se escribía y nada más. Sigue
-- sin llevar `grant` ni `revoke` porque `create or replace` conserva el ACL.

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

  -- El evento de este paso a 'completed' ya lo escribió el trigger
  -- `on_order_status_change` en el update de arriba. Acá solo se le añade la
  -- frase que el trigger no puede saber: que fue por código de recogida. Se
  -- fusiona en vez de reemplazarse, porque `source` y `method` son dos hechos
  -- distintos del mismo evento.
  update public.order_events
  set metadata = metadata || jsonb_build_object('method', 'pickup_code')
  where order_id = p_order_id
    and status = 'completed'
    and metadata->>'source' = 'database'
    and metadata->>'method' is null;

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'status', 'completed'
  );
end;
$$;