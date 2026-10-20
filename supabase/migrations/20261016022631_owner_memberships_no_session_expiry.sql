-- ─────────────────────────────────────────────────────────────────────────────
-- Los dueños del backfill no vencen: el TTL con el que nacieron nunca tuvo sello
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── LA TRAMPA, Y POR QUÉ ESTA MIGRACIÓN EXISTE ───────────────────────────────
--
-- `20261014005016_backfill_business_members.sql` inserta
-- `(business_id, user_id, role, label, alias)` y NADA MÁS. No escribe
-- `last_authenticated_at`, y no podía: el único que lo escribe es el
-- `POST /staff/session` del §8, y `apps/api/src/modules/staff/` todavía no
-- existe. Las 16 filas de producción nacieron, entonces, sin sello. Tampoco
-- escribe `session_ttl_hours`, así que cada una heredó el `default 24` que puso
-- `20261014002328:81`.
--
-- UN TTL SIN SELLO ES UNA SESIÓN VENCIDA POR DEFINICIÓN. Las dos mitades de
-- "vencida" que comparten `can_manage_location` y
-- `business_member_session_valid` son
--
--     (expires_at is not null and expires_at < now())
--     or (ttl > 0 and last_authenticated_at is null)
--
-- y la segunda es cierta para las 16. Medido sobre las filas reales de
-- producción antes de escribir esto, evaluando la expresión del propio helper:
--
--      role    | ttl | filas | denegadas_por_ttl | sesion_valida
--      owner   | 24  |   16  |                 16 |             0
--
-- Es decir: las 25 policies de `20261015015012` y los tres RPCs que recrea les
-- niegan TODO a los 16 dueños reales. El producto funciona hoy sólo porque las
-- policies viejas de `business_ownership` siguen encima, y las permisivas se
-- unen con OR.
--
-- ─── POR QUÉ `0`, Y POR QUÉ NO SELLARLAS ─────────────────────────────────────
--
-- NO se arregla con `last_authenticated_at = now()`. Eso es una mecha de 24
-- horas: mañana vuelven a quedar denegadas, y así todos los días, hasta que
-- exista el endpoint que las vuelva a sellar. Un arreglo que devuelve el acceso
-- por 24 horas y después se lo quita en silencio es PEOR que no arreglar nada,
-- porque parece verde.
--
-- `0` es la verdad sobre estas filas. El §5.2 dice que el TTL es «un control de
-- responsabilidad y UX, no una frontera de seguridad», y el §9.2 le ofrece al
-- dueño y al gerente la sesión persistente como opción explícita. El TTL existe
-- para que una tablet compartida en el mostrador de una panadería no siga
-- abierta: un dueño que nunca usó el flujo de personal no tiene sello porque ese
-- flujo no existe todavía, no porque su sesión haya vencido. Y un TTL de 24 horas
-- le niega el negocio que es suyo.
--
-- El `default 24` de la columna SE QUEDA, y es lo correcto: es el valor del
-- acceso de personal que la API creará más adelante. Esta migración arregla las
-- filas que produjo el backfill, no el default.
--
-- ─── POR QUÉ ESTOS TRES PREDICADOS ───────────────────────────────────────────
--
-- `role = 'owner'`: el backfill no crea ninguna otra cosa, y el defecto que se
-- corrige es el de los dueños, no el de un empleado.
--
-- `last_authenticated_at is null`: una fila SELLADA tiene una sesión de verdad y
-- una ventana de verdad, y ese TTL no es de este arreglo. También deja la
-- migración idempotente por construcción: la segunda pasada no toca nada.
--
-- `exists (select 1 from public.business_ownership …)`: esto es lo que dice «la
-- fila que produjo el backfill». Sin él, esta migración sería en realidad «apagar
-- el TTL de todo dueño sin sello», y desactivaría en silencio el control de las
-- tablets compartidas sobre los accesos que la API cree en el futuro. El
-- predicado la ata al backfill y no la deja ser un interruptor general.
--
-- `session_ttl_hours <> 0`: una fila que ya está en 0 está bien, y sin este
-- predicado una segunda pasada le movería `updated_at` a una fila que no cambió
-- de nada.
--
-- ─── LO QUE ESTA MIGRACIÓN NO AFIRMA ─────────────────────────────────────────
--
-- No hay `raise exception` si el `update` no toca filas, y es a propósito: el
-- replay del harness arranca SIN filas de `business_ownership` —los seeds no se
-- reproducen, y `supabase/migrations/README.md` documenta por qué—, así que acá
-- el conteo de filas afectadas es cero en un entorno limpio. Una aserción
-- convertiría cada `db push` a una base vacía en un error.
--
-- Y `updated_at` se mueve porque el significado de la fila cambió: no hay
-- trigger que lo mantenga, así que dejarlo en el `now()` del backfill haría que
-- la fila dijera que nadie la tocó.

update public.business_members m
   set session_ttl_hours = 0,
       updated_at = now()
 where m.role = 'owner'
   and m.last_authenticated_at is null
   and m.session_ttl_hours <> 0
   and exists (
     select 1
       from public.business_ownership o
      where o.business_id = m.business_id
        and o.owner_id = m.user_id
   );