-- ─────────────────────────────────────────────────────────────────────────────
-- Un pedido no se recoge sin código, y `null` no es un código
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── EL AGUJERO, Y POR QUÉ AHORA ES ALCANZABLE ───────────────────────────────
--
-- `pickup_code` es NOT NULL, así que el código del pedido nunca es nulo. El que
-- llega en `p_pickup_code` sí: PostgREST pasa un `null` de JSON tal cual, y
--
--     if v_order.pickup_code <> p_pickup_code then
--
-- con `'ABC123' <> null::text` da NULL, no TRUE. En un `if`, un NULL es lo
-- mismo que FALSE: la rama no se toma. La función sigue de largo y ejecuta
--
--     update public.orders set status = 'completed' ...
--
-- O sea que quien llame con `p_pickup_code => null` completa el pedido sin
-- saber ningún código.
--
-- El defecto de tres valores es ANTERIOR —está en `20260615195645`, que es
-- quien creó la función— y durante el tiempo que la puerta fue del dueño no
-- cambió nada observable para el negocio: el dueño podía completarlo con el
-- código o sin él, y no le costaba nada. Lo que cambió es QUIÉN puede entrar.
-- La puerta era `businesses.owner_id = auth.uid()` y hoy es
-- `can_manage_location`, que admits gerentes y al cajero acotado a su
-- sucursal. El hueco pasó de ser una comodidad del dueño a ser un exploit del
-- cajero: completar pedidos de su rama sin código, accrueando ingresos, y
-- saltándose la invariante que el propio `set_order_status` impone en su
-- rama "Transición reservada al sistema", donde un negocio JAMÁS mueve su
-- pedido a `completed`.
--
-- ─── EL ARREGLO ──────────────────────────────────────────────────────────────
--
-- `is distinct from` trata el NULL como un valor más, que es lo que hace falta
-- acá: compara Null-safe, devuelve TRUE si uno es nulo y el otro no, y FALSE
-- solo si los dos son iguales o los dos son nulos. Como la columna es NOT NULL,
-- un NULL de entrada es siempre distinto, y la rama de `INVALID_CODE` se toma.
--
-- Esto no cambia lo que pasa con un código equivocado, que ya devolvía
-- `INVALID_CODE`, ni con el código correcto. Solo deja de haber un camino sin
-- código. El resto de la función —el permiso por `can_manage_location`, el
-- orden de los errores, la anotación del evento de `20261015022233`— queda como
-- estaba, y sigue sin llevar `grant` ni `revoke`: `create or replace`
-- conserva el ACL.

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
  --
  -- `is distinct from`, y no `<>`: `p_pickup_code` lo elige quien llama y
  -- PostgREST le pasa un `null` de JSON tal cual, y `'ABC123' <> null` da
  -- NULL, que en un `if` es exactamente lo mismo que FALSE. Con `<>` la
  -- función seguía de largo y completaba el pedido sin código. La columna es
  -- NOT NULL, así que comparar con `is distinct from` no abre ningún otro
  -- camino: la única forma de pasar es traer el código exacto.
  if v_order.pickup_code is distinct from p_pickup_code then
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