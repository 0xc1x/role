-- ─────────────────────────────────────────────────────────────────────────────
-- Los topes y las features se leen del catálogo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── POR QUÉ ESTA MIGRACIÓN EXISTE ───────────────────────────────────────────
--
-- El catálogo del §4.5 ya es DATO: `public.subscription_plans` guarda los topes
-- de cada plan y `public.subscription_plan_features` guarda qué incluye cada
-- uno (`20261021163528_subscription_plan_catalog.sql`). Pero el MOTOR seguía
-- llevar su propia copia, escrita a mano: los números de los topes estaban en
-- el `case v_plan` de los dos triggers, y el catálogo plan → feature estaba en
-- el `case` de `business_has_feature`.
--
-- Con esta migración hay UNA copia: la fila. El motor la lee, y el número que
-- el dueño lee en el mensaje es el MISMO que el motor aplica, porque salen de
-- la misma lectura y no de dos copias que puedan apartarse.
--
-- ─── LO QUE NO CAMBIA: LA LETRA DE LOS MENSAJES ──────────────────────────────
--
-- Los `raise` de NEGOCIO —dos por trigger, cuatro en total— conservan su texto,
-- su `errcode`, su `detail` y su `hint` EXACTAMENTE como estaban. El API los
-- reenvía al dueño tal cual (`apps/api/src/modules/staff/staff.service.ts`) y
-- parsea el `detail` para dibujar el número, así que un cambio de prosa o de
-- formato es un cambio de contrato con el panel.
--
-- La ÚNICA prosa que cambia es la del refusal de catálogo roto —el que era el
-- `else` del `case`—, que ahora habla del catálogo, porque es del catálogo de
-- lo que habla: la fila no está.
--
-- ─── EL CATÁLOGO ROTO ES RUIDOSO, Y NO ES `R0001` ────────────────────────────
--
-- Un plan sin fila en `subscription_plans` es un CATÁLOGO ROTO, no un plan
-- sin tope: el motor no puede saber qué admite ese plan, y contestar «sin
-- tope» sería inventarle un permiso que nadie compró.
--
-- Por eso el refusal NO lleva `errcode`: `R0001` significa «subí de plan», y
-- esta no es una regla de negocio sino una avería de configuración. Un `R0001`
-- aquí sería una mentira: el dueño subiría de plan y el catálogo seguiría
-- roto. Sin `errcode` la excepción es la genérica de Postgres (`P0001`), que
-- llega al panel como un 500 y no como un «subí de plan» que no arregla nada.
--
-- Y conserva la forma de una sola línea, sin `detail` ni `hint`: el `detail`
-- del refusal de plan lleva los números que el API dibuja, y aquí no hay
-- ningún número que dibujar —lo que falta es la fila.
--
-- ─── `is_active` NO FILTRA EL MOTOR ──────────────────────────────────────────
--
-- La búsqueda del tope es por CÓDIGO y sin `is_active`. Retirar un plan de la
-- oferta es `is_active = false`: dejar de venderlo, no cambiar lo que el
-- negocio que YA lo tiene puede hacer. Si el tope desapareciera al retirar el
-- plan, todos los negocios que lo tuvieran se quedarían sin techo de golpe, y
-- un negocio sin techo es un negocio que crece sin que nadie lo haya
-- comprado.
--
-- Por eso `is_active` no entra en la búsqueda, y por eso la fila que falta es
-- una sola cosa y no dos: el plan no está en el catálogo.
--
-- ─── LA FILA DEL PLAN SE MIRA ANTES QUE LA FEATURE ──────────────────────────
--
-- `subscription_plan_features` cuelga de `subscription_plans` con `on delete
-- cascade`: si el catálogo pierde la fila de un plan, sus features se van con
-- ella. Con el orden viejo —feature primero, tope después— un catálogo roto
-- habría respondido «tu plan no incluye accesos de personal» (`R0001`), que es
-- MENTIRA: lo que está roto es el catálogo, no el plan. Y un `R0001` manda al
-- dueño a una puerta que no arregla nada.
--
-- Así que el cuerpo mira la fila del plan PRIMERO, se niega en voz alta si no
-- está, y sólo después pregunta por la feature. La feature sigue preguntándose
-- sólo cuando la escritura crece, y su `R0001` sigue siendo el de siempre.
--
-- ─── LA NEGATIVA SÓLO CUANDO LA ESCRITURA CRECE ─────────────────────────────
--
-- El motor necesita el tope para DECIDIR si la fila entra. Una escritura que
-- no crece —renombrar una sucursal, cambiar una etiqueta, pausar un acceso—
-- no necesita el número, y por eso no lo busca: un negocio con el catálogo
-- roto tiene que poder seguir operándose entero (§5.3 bloquea crecer, no
-- operar). La negativa por catálogo roto es, por tanto, tan sólo una negativa
-- de crecimiento: nunca una negativa de operación.
--
-- ─── EL NÚMERO QUE QUEDA EN EL MOTOR, Y POR QUÉ ─────────────────────────────
--
-- En el cuerpo de los dos triggers queda UN número, y no es un tope: es el `1`
-- que decide si «sucursal» va en singular o en plural. Es GRAMÁTICA. El tope
-- sale de la fila, y este número sólo dice cómo hay que escribir la palabra.
--
-- Y por eso la aritmética del conteo —la bandera de crecimiento convertida en
-- cuenta— se escribe como `v_agrega::integer` y no como `case when v_agrega
-- then 1 else 0 end`: el `then 1 else 0` era un número más en el cuerpo, y un
-- número en el cuerpo de un trigger es un número que puede ser un tope. El
-- valor es el mismo (`true` → 1, `false` → 0), y el cast no puede devolver
-- `null` porque la bandera no puede serlo: se construye con `new.is_active` y
-- `old.is_active` —`NOT NULL`—, con `new.deleted_at is null` y con
-- `is distinct from`, y las cuatro dan `true` o `false`. El cuerpo de cada
-- trigger lo explica en la línea del cast.
--
-- ─── LA ACL NO CAMBIA, Y LAS TRES LÍNEAS LA DICEN EN VOZ ALTA ────────────────
--
-- `create or replace` conserva la ACL por sí solo, así que estas líneas no
-- cambian nada: lo que hacen es dejarla escrita, para que el archivo no dependa
-- de una propiedad del `create or replace` que nadie lee. `business_has_feature`
-- es la versión que el cliente puede llamar —y sólo el cliente con sesión—, y
-- las dos triggers son de motor: nadie las llama, las dispara el trigger.
--
-- ─── QUÉ NO TOCA ESTE ARCHIVO ────────────────────────────────────────────────
--
-- Ni los triggers (`trg_enforce_location_limit`, `trg_enforce_member_limit`),
-- ni su enganche (`before insert or update`), ni `public.business_plan_of`, ni
-- las filas del catálogo, ni sus números. Los números del §4.5 no se mueven
-- aquí: lo que se mueve es QUIÉN los lee.

-- ─── `business_has_feature`: EL CATÁLOGO DE FEATURES, EN TABLA ───────────────
--
-- El catálogo de QUÉ incluye cada plan es `public.subscription_plan_features`:
-- una fila por (plan, feature). Esta función ya no lo lleva dentro: lo
-- consulta, y por eso la copia del plan → feature que vivía en su `case`
-- desaparece.
--
-- El plan lo sigue respondiendo `public.business_plan_of`, que es la única
-- definición de «qué plan tiene este negocio»
-- (`20261021172305_generic_subscriptions.sql`).
--
-- Un plan que NO está en `subscription_plans` no tiene filas en
-- `subscription_plan_features` —el `cascade` se las lleva—, así que la
-- respuesta es `false`: «este plan no concede esta feature». NO es lo mismo que
-- un plan del catálogo al que le falta la feature, pero es la misma respuesta
-- para quien pregunta, y es la respuesta segura: una feature que no está en el
-- catálogo no se concede.
--
-- El motor NO se apoya en esta respuesta para detectar un catálogo roto: eso
-- lo hace cada trigger, que mira la fila del plan ANTES de preguntarle y se
-- niega en voz alta si la fila no está. Aquí la pregunta es «¿este plan concede
-- esta feature?», y lo que hay en el catálogo es la respuesta.
--
-- La forma es `… in (select …)` y no `exists (select 1 …)`, y no es un capricho:
-- es lo que deja el cuerpo SIN NINGÚN NÚMERO. `exists (select 1 …)` dejaría un
-- `1` —el idioma del `exists`— y el único número que puede quedar en el motor
-- es el que decide el singular del mensaje (§4.5). Un número en el cuerpo de
-- una función es un número que un día puede ser un tope.

create or replace function public.business_has_feature(p_business_id uuid, p_feature public.business_feature)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.business_plan_of(p_business_id) in (
    select f.plan_code
      from public.subscription_plan_features f
     where f.feature = p_feature
  )
$$;

-- ─── EL TOPE DE LAS SUCURSALES ──────────────────────────────────────────────
--
-- El cuerpo conserva el orden, los mensajes y el `detail` de siempre. Lo que
-- cambia es de dónde sale el número: de la fila del catálogo, y no de un
-- `case` escrito a mano.

create or replace function public.enforce_business_location_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan    public.business_plan_code;
  v_limit   integer;
  v_otros   integer;
  v_despues integer;
  v_agrega  boolean;
begin
  -- El plan se resuelve PRIMERO: el mensaje de más abajo lo nombra, y una
  -- variable sin valor en un `raise` es un mensaje roto.
  v_plan := public.business_plan_of(new.business_id);

  -- ¿ESTA escritura está activando una sucursal? Sólo eso agrega una fila al
  -- conteo. Renombrar una sucursal que ya estaba activa no la agrega, y por eso
  -- no puede ser la razón de un rechazo. La mudanza a otro negocio sí cuenta:
  -- para el negocio de destino la fila es nueva.
  if tg_op = 'INSERT' then
    v_agrega := new.is_active;
  else
    v_agrega := new.is_active
               and (not old.is_active or old.business_id is distinct from new.business_id);
  end if;

  -- EL TOPE, DE LA FILA DEL CATÁLOGO, Y SÓLO CUANDO LA ESCRITURA CRECE.
  --
  -- `public.subscription_plans` es la fuente: la fila del plan dice cuántas
  -- sucursales admite, y no hay ninguna otra copia de ese número en el motor.
  --
  -- La búsqueda es por CÓDIGO y sin `is_active`: retirar un plan de la oferta
  -- no le cambia el tope a los negocios que ya lo tienen.
  --
  -- Y la fila que falta es UNA cosa, no dos: el plan no está en el catálogo.
  -- `pro_plus` tiene la fila con el tope en `null`, y `null` es un PERMISO
  -- («sin tope»), no una avería. Una fila que no está es una avería, y por eso
  -- se dice en voz alta y sin `errcode`: no es `R0001` —aquí no hay nada que
  -- comprar— sino un catálogo roto.
  --
  -- Sólo cuando la escritura CRECE: el motor necesita el tope para decidir si
  -- la fila entra. Renombrar una sucursal, cambiarle el nombre o moverla de
  -- negocio no crece, y un negocio con el catálogo roto tiene que poder
  -- seguir operándose entero (§5.3 bloquea crecer, no operar).
  if v_agrega then
    select p.max_locations into v_limit
      from public.subscription_plans p
     where p.code = v_plan;

    if not found then
      raise exception 'el plan % no está en el catálogo de planes', v_plan;
    end if;
  end if;

  -- LA FEATURE, Y SOLO CUANDO LA ESCRITURA CRECE. Lo mismo que en los miembros,
  -- y por la misma razón: el §5.3 bloquea crecer, no operar.
  --
  -- Y va DESPUÉS de mirar la fila del plan, a propósito: si el catálogo perdió
  -- la fila del plan, el `cascade` se llevó sus features con ella, y esta
  -- comprobación respondería «tu plan no incluye accesos de personal», que es
  -- MENTIRA —lo que está roto es el catálogo— y mandaría al dueño a una puerta
  -- que no arregla nada. El motor ya se negó arriba, con la verdad.
  if v_agrega
     and not public.business_has_feature(new.business_id, 'staff_access'::public.business_feature) then
    raise exception 'el plan % no incluye accesos de personal', v_plan
      using
        errcode = 'R0001',
        detail = format('business=%s plan=%s feature=%s',
                        new.business_id, v_plan, 'staff_access'),
        hint = 'subí de plan para administrar el equipo';
  end if;

  -- `null` es «sin tope» (§4.5): el plan más caro no tiene ninguno, y eso es
  -- un permiso, no un olvido.
  if v_limit is null then
    return new;
  end if;

  -- EL CONTEO. Sin este `select`, `v_otros` y `v_despues` quedan en `null`, la
  -- comparación del tope nunca es cierta y el trigger no rechaza NADA. Es el
  -- bloque que `20261017033947` traía y que la migración anterior se comió.
  select count(*)::int
    into v_otros
    from public.business_locations l
   where l.business_id = new.business_id
     and l.is_active
     and (tg_op = 'INSERT' or l.id <> new.id);

  -- La cuenta DESPUÉS de esta escritura: la bandera de crecimiento vale uno
  -- cuando esta escritura mete una fila en el conteo, y cero cuando no. Es una
  -- CUENTA, no un tope —y por eso se escribe como un cast y no como un `then 1
  -- else 0`: un número escrito en el cuerpo de un trigger es un número que
  -- puede ser un tope.
  --
  -- Y el cast NO PUEDE devolver `null`, que es lo único que lo haría
  -- peligroso: `v_agrega` se construye con `new.is_active` y con
  -- `old.is_active` —las dos columnas son `NOT NULL`— y con
  -- `is distinct from`, que nunca devuelve `null`. La bandera es siempre
  -- `true` o `false`, y el cast devuelve `1` o `0`.
  --
  -- Y el `return new` de ARRIBA es lo que hace que esta comparación signifique
  -- algo: ahí `v_limit` ya no es `null` —el `pro_plus` se fue por su `null`, y
  -- una escritura que no crece ni siquiera lo buscó— y las dos cantidades que
  -- se comparan son números. Si la bandera fuera `null`, el cast devolvería
  -- `null`, `v_despues` sería `null` y la comparación no sería cierta: el
  -- trigger dejaría de rechazar. Por eso la no-nulabilidad de la bandera está
  -- ESCRITA aquí y no supuesta.
  v_despues := v_otros + (v_agrega::integer);

  -- La comparación sólo cuando la escritura CRECIÓ. Un negocio por encima de su
  -- plan puede seguir operándolo entero; lo que no puede es pasarse más.
  if v_despues > v_otros and v_despues > v_limit then
    -- El sustantivo es un ARGUMENTO, no un `%s`: en plpgsql el marcador es `%`
    -- y nada más. El plural lo decide el número, y este `1` decide el
    -- SINGULAR: es GRAMÁTICA, no un tope. El tope sale de la fila del catálogo
    -- (`max_locations`, la de más arriba) y este número sólo dice si la palabra
    -- va en singular o en plural.
    raise exception 'el plan % admite hasta % %, no más', v_plan, v_limit,
      case when v_limit = 1 then 'sucursal' else 'sucursales' end
      using
        errcode = 'R0001',
        detail = format('business=%s plan=%s limit=%s current=%s',
                        new.business_id, v_plan, v_limit, v_despues),
        hint = 'subí de plan o gestioná el acceso que ya existe';
  end if;

  return new;
end;
$$;

-- ─── EL TOPE DE LOS MIEMBROS ─────────────────────────────────────────────────
--
-- El mismo cuerpo que el de las sucursales, con su cuenta y sus mensajes. El
-- dueño NO consume cupo (§4.5): el tope cuenta las filas con `role <> 'owner'`,
-- y una fila de dueño no tiene por qué hablar de planes para nada.

create or replace function public.enforce_business_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan    public.business_plan_code;
  v_limit   integer;
  v_otros   integer;
  v_despues integer;
  v_agrega  boolean;
begin
  -- EL DUEÑO PRIMERO, y sale antes que el plan y antes que la feature. No es
  -- una cuestión de orden: es que un dueño nunca consume cupo (§4.5), y una fila
  -- de dueño no tiene por qué hablar de planes para nada.
  if new.role = 'owner'::public.business_member_role then
    return new;
  end if;

  -- UNA DEGRADACIÓN NO ES UN TOPE.
  --
  -- Degradar al dueño está cerrado por `enforce_owner_is_untouchable`, que lo
  -- niega con `R0002`, y el nombre del trigger decide el orden: el de los topes
  -- corre antes. Sin esta salida, una degradación en un negocio en el tope
  -- moría con el `R0001` del plan —«subí de plan»— para una operación que no
  -- tiene nada que ver con el plan.
  --
  -- La salida va antes de contar: una degradación no crece, no consume plaza y
  -- no toca ningún tope. Llega al guard del dueño, y el operador ve la razón
  -- de verdad.
  if old.role = 'owner'::public.business_member_role
     and new.role <> 'owner'::public.business_member_role then
    return new;
  end if;

  v_plan := public.business_plan_of(new.business_id);

  -- ¿ESTA escritura está METIENDO una fila en el conteo? No es lo mismo que
  -- «¿la fila queda contando?»: cambiar el `label`, el `alias`, el `role` o el
  -- `status` de un acceso que ya existe la deja contando igual, y eso no es
  -- crecimiento. Sólo suma cuando la fila ANTES no contaba y ahora sí.
  --
  -- Y la fila que esta escritura toca sigue en la tabla con sus valores viejos,
  -- así que `v_otros` la excluye por `id`.
  --
  -- El `old.role = 'owner'` de acá es la condición que usaría una transferencia
  -- de propiedad —una fila que deja de ser dueño pasa a ocupar plaza—. Hoy no
  -- se puede alcanzar, porque la degradación sale tres líneas más arriba; está
  -- porque el día de la transferencia el conteo tiene que ser el correcto.
  if tg_op = 'INSERT' then
    v_agrega := new.deleted_at is null;
  else
    v_agrega := new.deleted_at is null
               and (old.role = 'owner'::public.business_member_role
                    or old.deleted_at is not null
                    or old.business_id is distinct from new.business_id);
  end if;

  -- EL TOPE, DE LA FILA DEL CATÁLOGO, Y SÓLO CUANDO LA ESCRITURA CRECE.
  --
  -- `public.subscription_plans` es la fuente: la fila del plan dice cuántos
  -- miembros admite, y no hay ninguna otra copia de ese número en el motor.
  --
  -- La búsqueda es por CÓDIGO y sin `is_active`: retirar un plan de la oferta
  -- no le cambia el tope a los negocios que ya lo tienen.
  --
  -- Y la fila que falta es UNA cosa, no dos: el plan no está en el catálogo.
  -- `pro_plus` tiene la fila con el tope en `null`, y `null` es un PERMISO
  -- («sin tope»), no una avería. Una fila que no está es una avería, y por eso
  -- se dice en voz alta y sin `errcode`: no es `R0001` —aquí no hay nada que
  -- comprar— sino un catálogo roto.
  --
  -- Sólo cuando la escritura CRECE: el motor necesita el tope para decidir si
  -- la fila entra. Cambiar la etiqueta de un acceso, pausarlo o darlo de baja
  -- no crece, y un negocio con el catálogo roto tiene que poder seguir
  -- operándose entero (§5.3 bloquea crecer, no operar).
  if v_agrega then
    select p.max_members into v_limit
      from public.subscription_plans p
     where p.code = v_plan;

    if not found then
      raise exception 'el plan % no está en el catálogo de planes', v_plan;
    end if;
  end if;

  -- LA FEATURE, Y SOLO CUANDO LA ESCRITURA CRECE.
  --
  -- Un plan sin `staff_access` no puede CREAR accesos nuevos —crecer es lo que
  -- el plan no compra—, pero los que ya existen siguen funcionando: cambiar la
  -- etiqueta, pausar, dar de baja, sellar la sesión. Eso es el §5.3.
  --
  -- Y va DESPUÉS de mirar la fila del plan, a propósito: si el catálogo perdió
  -- la fila del plan, el `cascade` se llevó sus features con ella, y esta
  -- comprobación respondería «tu plan no incluye accesos de personal», que es
  -- MENTIRA —lo que está roto es el catálogo— y mandaría al dueño a una puerta
  -- que no arregla nada. El motor ya se negó arriba, con la verdad.
  if v_agrega
     and not public.business_has_feature(new.business_id, 'staff_access'::public.business_feature) then
    raise exception 'el plan % no incluye accesos de personal', v_plan
      using
        errcode = 'R0001',
        detail = format('business=%s plan=%s feature=%s',
                        new.business_id, v_plan, 'staff_access'),
        hint = 'subí de plan para administrar el equipo';
  end if;

  -- `null` es «sin tope» (§4.5): el plan más caro no tiene ninguno, y eso es
  -- un permiso, no un olvido.
  if v_limit is null then
    return new;
  end if;

  select count(*)::int
    into v_otros
    from public.business_members m
   where m.business_id = new.business_id
     and m.role <> 'owner'::public.business_member_role
     and m.deleted_at is null
     and (tg_op = 'INSERT' or m.id <> new.id);

  -- La cuenta DESPUÉS de esta escritura: la bandera de crecimiento vale uno
  -- cuando esta escritura mete una fila en el conteo, y cero cuando no. Es una
  -- CUENTA, no un tope —y por eso se escribe como un cast y no como un `then 1
  -- else 0`: un número escrito en el cuerpo de un trigger es un número que
  -- puede ser un tope.
  --
  -- Y el cast NO PUEDE devolver `null`, que es lo único que lo haría
  -- peligroso: `v_agrega` se construye con `new.deleted_at is null` —que
  -- devuelve `true` o `false`, nunca `null`— y con comparaciones de `role` y
  -- de `business_id`: `old.role` es `NOT NULL` y `is distinct from` nunca
  -- devuelve `null`. La bandera es siempre `true` o `false`, y el cast
  -- devuelve `1` o `0`.
  --
  -- Y el `return new` de ARRIBA es lo que hace que esta comparación signifique
  -- algo: ahí `v_limit` ya no es `null` —el `pro_plus` se fue por su `null`, y
  -- una escritura que no crece ni siquiera lo buscó— y las dos cantidades que
  -- se comparan son números. Si la bandera fuera `null`, el cast devolvería
  -- `null`, `v_despues` sería `null` y la comparación no sería cierta: el
  -- trigger dejaría de rechazar. Por eso la no-nulabilidad de la bandera está
  -- ESCRITA aquí y no supuesta.
  v_despues := v_otros + (v_agrega::integer);

  -- La comparación sólo cuando la escritura CRECIÓ. Un negocio por encima de su
  -- plan puede seguir operándolo entero; lo que no puede es pasarse más.
  if v_despues > v_otros and v_despues > v_limit then
    raise exception 'el plan % admite hasta % miembros, no más', v_plan, v_limit
      using
        errcode = 'R0001',
        detail = format('business=%s plan=%s limit=%s current=%s',
                        new.business_id, v_plan, v_limit, v_despues),
        hint = 'subí de plan o gestioná el acceso que ya existe';
  end if;

  return new;
end;
$$;

-- La ACL no cambia, y estas líneas lo dicen en voz alta en vez de confiar en
-- que `create or replace` la conserve. `business_has_feature` es la versión
-- que el cliente puede llamar —y sólo el cliente con sesión—, y las dos
-- triggers son del motor: nadie las llama, las dispara el trigger.
revoke all on function public.business_has_feature(uuid, public.business_feature) from public, anon;
grant execute on function public.business_has_feature(uuid, public.business_feature) to authenticated;
revoke all on function public.enforce_business_location_limit() from public, anon;
revoke all on function public.enforce_business_member_limit() from public, anon;