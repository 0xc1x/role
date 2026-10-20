-- ─────────────────────────────────────────────────────────────────────────────
-- Un negocio inactivo libera a su dueño, y un negocio sin dueño no vuelve
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── LA REGLA, EN UNA FRASE ──────────────────────────────────────────────────
--
-- **Un negocio INACTIVO puede no tener dueño. Un negocio ACTIVO no puede, y un
-- negocio que perdió a su dueño no vuelve a la vida sin que la plataforma le
-- devuelva uno.**
--
-- La primera mitad ya la decía el trigger diferido de la Task 3
-- (`enforce_business_keeps_an_owner`); esta migración agrega la SEGUNDA: la
-- puerta por la que un dueño se va (la liberación) y la puerta por la que un
-- negocio sin dueño vuelve (la recuperación, que es la Task 6).
--
-- ─── «LIBERADO», Y QUÉ SIGNIFICA EXACTAMENTE ─────────────────────────────────
--
-- La palabra hay que definirla, porque la base la entiende y el servicio
-- también, y dos definiciones son dos reglas:
--
--   1. **La membresía de dueño se ARCHIVA** (`deleted_at = now()`), no se borra.
--      El §8 dice que la baja de una membresía es lógica: la fila queda para
--      saber quién operó en el negocio, y el alias queda quemado —el índice
--      único `business_members_alias_key` NO lleva predicado `deleted_at is
--      null`, a propósito—.
--   2. **Sus filas de alcance se archivan con ella.** Las dos tablas tienen
--      `deleted_at` y discrepaban sobre qué significaba (ítem 14 de la
--      herencia): una membresía archivada con su alcance vivo es una fila que
--      sigue diciendo «esta persona llegaba a esta sucursal» de alguien que ya
--      no está.
--   3. **La fila de `business_ownership` de ese negocio SE BORRA** (mientras la
--      tabla exista). Es la fila que el móvil lee para saber de quién es el
--      negocio, y dejarla apuntando a una persona que se va es el huérfano
--      silencioso del ítem 7: un negocio que dice tener un dueño y no tiene
--      a nadie.
--   4. **El negocio NO se borra ni se reactiva.** Conserva ofertas, pedidos,
--      sucursales y horarios: esto es una jubilación, no un borrado.
--   5. **Los OTROS miembros no se tocan.** La liberación es del DUEÑO: el
--      equipo que se queda sigue siendo equipo, con sus alcances, y es el que
--      recibe al dueño nuevo cuando la plataforma lo devuelva.
--
-- ─── POR QUÉ UNA FUNCIÓN Y NO UN `UPDATE` ─────────────────────────────────────
--
-- Porque la liberación son TRES escrituras que tienen que pasar juntas —la
-- membresía archivada, su alcance archivado y la fila de propiedad borrada— y
-- porque la regla de CUÁNDO se puede liberar (sólo un negocio inactivo, y sólo
-- por su dueño vivo) tiene que ser una regla de la base: el móvil escribe
-- directo a Supabase (ADR-0002) y no pasa por esta API.
--
-- ─── EL ACTOR ES UN ARGUMENTO, Y POR QUÉ ─────────────────────────────────────
--
-- `transfer_business_ownership` toma el llamador de `auth.uid()`, porque quien
-- transfiere es el dueño, presente y con sesión. La liberación es otra cosa: la
-- pide una cuenta que se va —la que borra su cuenta— y esa cuenta ya no tiene
-- sesión, o la tiene vencida, y en ninguno de los dos casos hay un `auth.uid()`
-- que diga «el dueño». El llamador es un ARGUMENTO, y la función comprueba
-- ella misma que ese argumento es el dueño vivo del negocio. Eso no la
-- vuelve una puerta abierta: su ACL es `{postgres, service_role}` y nadie más
-- la puede ejecutar.
--
-- ─── EL CERROJO, Y POR QUÉ ESTÁ ──────────────────────────────────────────────
--
-- `select … for update` sobre la fila del negocio, al principio de la función.
-- El plan no pide `for update` ni un nivel de aislamiento serializable, así que
-- el cerrojo es explícito: dos transferencias del mismo negocio, o una
-- transferencia y una liberación, tienen que verse en fila. Sin el cerrojo, la
-- segunda leería un estado viejo y el índice parcial
-- `business_members_one_owner_per_business` la frenaría con un `23505` —un
-- error de índice, no una regla— o, peor, dejaría un estado intermedio
-- commiteado. Con el cerrojo, la segunda ve el estado final de la primera y
-- se niega con el motivo que corresponde (`R0004`).
--
-- ─── LA REACTIVACIÓN, Y POR QUÉ LA GUARDA ES DE `businesses` ────────────────
--
-- El trigger diferido de la Task 3 vigila las MEMBRESÍAS: se dispara cuando
-- una fila de `business_members` cambia, y mira si el negocio quedó sin
-- dueño. NO se dispara cuando el negocio cambia de `is_active`, y ahí está el
-- agujero: `update businesses set is_active = true` sobre un negocio sin
-- dueño deja un negocio activo sin dueño, y nadie lo va a avisar.
--
-- La guarda vive en `businesses` porque es la escritura la que decide: es
-- donde se puede saber si el negocio tiene dueño en el momento de activarse.
-- Y la consecuancia hay que sayirla en voz alta: **aprobar** un negocio sin
-- dueño vivo aborta la aprobación, porque `apply_business_verification_state`
-- hace `update businesses set is_active = (new.verification_status =
-- 'approved')`. La moderación deja de poder publicar un negocio al que se le
-- fue el dueño, y la puerta de salida es la de la Task 6.
--
-- ─── EL BORRADO DE LA FILA DE DUEÑO ──────────────────────────────────────────
--
-- La Task 3 sacó del trigger `BEFORE UPDATE` la guarda que negaba archivar al
-- dueño, porque la archivación es media liberación y la liberación la decide
-- el estado final de la transacción. Con esa guarda fuera, una fila de dueño
-- archivada se puede BORRAR —el trigger `BEFORE DELETE` sólo protege al dueño
-- VIVO— y ese borrado es el camino que deja el huérfano: la fila de propiedad
-- sobrevive nombrando a una persona que ya no tiene membresía.
--
-- Por eso este trigger se reescribe: **una fila de dueño no se borra mientras el
-- negocio la nombre como su dueño.** La liberación borra la fila de propiedad
-- en la MISMA transacción, así que después de una liberación el borrado es
-- limpieza de historia y antes de ella es el huérfano. Y la comprobación se
-- hace con `to_regclass` porque `business_ownership` se retira en la Task 10:
-- el día que la tabla no esté, la guarda se apaga sola en vez de romper cada
-- borrado.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `business_live_owner_count`: LA DEFINICIÓN DE «dueño vivo»
--
-- Un dueño vivo es un dueño con las TRES mitades: `role = 'owner'`,
-- `status = 'active'` y `deleted_at is null`. Un dueño archivado es historia y
-- no administra nada; un dueño pausado tampoco.
--
-- Y vive en UNA función porque la regla la consulta la base por lo menos
-- cuatro veces: el trigger diferido, la guarda de reactivación, la recuperación
-- de la Task 6 y el servicio. Cuatro copias del mismo predicado son cuatro
-- reglas que pueden apartarse, y el predicado es la regla.
--
-- `stable security definer` porque tiene que ver TODAS las membresías del
-- negocio, no las que la RLS le deja ver a quien pregunta: un contador que
-- corriera como el invocante contaría cero dueño siempre que el invocante no
-- fuera el dueño.
create or replace function public.business_live_owner_count(p_business_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $fn$
  select count(*)::int
    from public.business_members m
   where m.business_id = p_business_id
     and m.role = 'owner'::public.business_member_role
     and m.status = 'active'::public.business_member_status
     and m.deleted_at is null;
$fn$;

revoke all on function public.business_live_owner_count(uuid)
  from public, anon, authenticated;
grant execute on function public.business_live_owner_count(uuid)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. `enforce_business_keeps_an_owner`: EL MISMO INVARIANTE, UNA DEFINICIÓN
--
-- No es una corrección: el comportamiento no cambia. Lo que cambia es que el
-- predicado del dueño vivo deja de estar escrito dos veces —acá y en
-- `business_live_owner_count`— y pasa a estar escrito una.
--
-- El predicado `v_live <> 1` se conserva tal cual, y por qué importa: el
-- índice parcial `business_members_one_owner_per_business` garantiza que no
-- haya dos dueños vivos a la vez, así que «exactamente uno» y «al menos uno»
-- son la misma cosa; pero la forma exacta es la que dice la regla, y la que va
-- a seguir diciendo cuando el índice cambie.
create or replace function public.enforce_business_keeps_an_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_ids         uuid[];
  v_business_id uuid;
  v_active      boolean;
  v_live        integer;
begin
  -- El negocio de la fila, y el de ORIGEN si la fila se mudó de negocio: una
  -- mudanza puede dejar al negocio viejo sin dueño, y ese negocio también
  -- tiene que ser invariante.
  v_ids := array[new.business_id];
  if old.business_id is distinct from new.business_id then
    v_ids := array_append(v_ids, old.business_id);
  end if;

  foreach v_business_id in array v_ids loop
    select b.is_active into v_active
      from public.businesses b
     where b.id = v_business_id;

    -- UN NEGOCIO INACTIVO PUEDE NO TENER DUEÑO. Es la otra mitad de la regla,
    -- y es la que hace posible la liberación (D2): un negocio que se apaga
    -- suelta a su dueño y queda sin él hasta que la plataforma le devuelva
    -- uno.
    if not coalesce(v_active, false) then
      continue;
    end if;

    v_live := public.business_live_owner_count(v_business_id);

    if v_live <> 1 then
      raise exception 'un negocio activo no puede quedar sin dueño vivo'
        using
          errcode = 'R0002',
          detail = format('business=%s member=%s', v_business_id, new.id),
          hint = 'transferí la propiedad a otro acceso antes de dejar al negocio sin dueño; un negocio inactivo puede no tenerlo';
    end if;
  end loop;

  return new;
end;
$fn$;

revoke all on function public.enforce_business_keeps_an_owner()
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. `release_business_ownership`: LA LIBERACIÓN
--
-- `volatile security definer set search_path = ''`, y el cuerpo QUALIFICADO
-- todo: con el `search_path` vacío, un nombre sin esquema no resuelve.
--
-- El ACL es `{postgres, service_role}`: la escriben el `pg_default_acl` del
-- proyecto y este `revoke`/`grant` explícito. `anon` y `authenticated` NO la
-- pueden ejecutar, aunque el móvil escriba directo a Supabase: la función es
-- la puerta, y una puerta que el cliente puede abrir no es una puerta.
create or replace function public.release_business_ownership(
  p_business_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_member record;
  v_active boolean;
begin
  -- 1. EL NEGOCIO, Y CON ÉL EL CERROJO. La fila se toma con `for update`:
  -- dos operaciones de propiedad sobre el mismo negocio tienen que verse en
  -- fila, y el cerrojo dura hasta el commit de esta transacción.
  select b.is_active into v_active
    from public.businesses b
   where b.id = p_business_id
     for update;

  if not found then
    raise exception 'el negocio no existe'
      using
        errcode = 'R0004',
        detail = format('business=%s', p_business_id),
        hint = 'no hay un negocio con ese identificador';
  end if;

  -- 2. UN NEGOCIO ACTIVO NO SE LIBERA: SE ENTREGA. La liberación es la
  -- retirada de un negocio apagado; la de uno vivo es la transferencia, que
  -- degrada al dueño saliente y deja el negocio con alguien.
  if coalesce(v_active, false) then
    raise exception 'un negocio activo no libera a su dueño: transferí la propiedad'
      using
        errcode = 'R0004',
        detail = format('business=%s', p_business_id),
        hint = 'la propiedad de un negocio activo se transfiere con POST /businesses/:businessId/ownership/transfer';
  end if;

  -- 3. EL DUEÑO VIVO, Y QUE SEA EL ACTOR. Las tres mitades: `role = 'owner'`,
  -- `status = 'active'` y `deleted_at is null`. Un dueño archivado ya no es
  -- el dueño de nada, y un dueño de otro negocio no es el dueño de ÉSTE.
  select m.id, m.user_id into v_member
    from public.business_members m
   where m.business_id = p_business_id
     and m.user_id = p_actor_user_id
     and m.role = 'owner'::public.business_member_role
     and m.status = 'active'::public.business_member_status
     and m.deleted_at is null
   limit 1;

  if not found then
    raise exception 'sólo el dueño vivo del negocio puede liberar la propiedad'
      using
        errcode = 'R0004',
        detail = format('business=%s actor=%s', p_business_id, p_actor_user_id),
        hint = 'la liberación la pide el dueño vivo del negocio';
  end if;

  -- 4. LA MEMBRESÍA SE ARCHIVA, NO SE BORRA. El §8: la baja de una membresía
  -- es lógica, y el alias queda quemado porque el índice único no lleva
  -- predicado de `deleted_at`.
  update public.business_members
     set deleted_at = now(),
         updated_at = now()
   where id = v_member.id;

  -- 5. Y SU ALCANCE, CON ELLA. Una membresía archivada con su alcance vivo
  -- dice «esta persona llegaba a esta sucursal» de alguien que ya no está.
  update public.business_member_locations
     set deleted_at = now(),
         updated_at = now()
   where member_id = v_member.id
     and deleted_at is null;

  -- 6. LA FILA DE PROPIEDAD SE BORRA, mientras la tabla exista. Es la fila que
  -- el móvil lee, y dejarla sería el huérfano silencioso: un negocio que dice
  -- tener un dueño y no tiene a nadie.
  --
  -- El `to_regclass` es porque `business_ownership` se retira en la Task 10:
  -- el día que la tabla no esté, la liberación sigue funcionando y no deja
  -- nada que borrar.
  if to_regclass('public.business_ownership') is not null then
    delete from public.business_ownership
     where business_id = p_business_id;
  end if;

  -- 7. LA RESPUESTA: los tres identificadores, y nada más. No hay ningún dato
  -- de la persona en la respuesta.
  return jsonb_build_object(
    'business_id', p_business_id,
    'released_member_id', v_member.id,
    'released_user_id', v_member.user_id
  );
end;
$fn$;

revoke all on function public.release_business_ownership(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.release_business_ownership(uuid, uuid)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. `enforce_business_reactivation_needs_owner`: LA PUERTA DE VOLVER
--
-- Un negocio sin dueño no se reactiva. La guarda vive en `businesses`, en el
-- `BEFORE UPDATE`, porque es la escritura la que decide: cuando se pide
-- `is_active = true` es cuando se puede saber si el negocio tiene dueño.
--
-- Y es `BEFORE` y no diferido a propósito: acá no hay estado intermedio que
-- esperar. A diferencia de la transferencia —que degrada y promueve en dos
-- sentencias y necesita el estado final—, activar un negocio es una sola
-- sentencia, y el dueño tiene que estar AHORA.
create or replace function public.enforce_business_reactivation_needs_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Un negocio que se queda inactivo no se activa por accidente: la guarda
  -- mira el valor NUEVO, y `false` no pide dueño.
  if new.is_active and public.business_live_owner_count(new.id) < 1 then
    raise exception 'un negocio sin dueño no se reactiva: devolvé el dueño primero'
      using
        errcode = 'R0002',
        detail = format('business=%s', new.id),
        hint = 'reactivar exige un dueño vivo: la plataforma se lo devuelve con POST /businesses/:businessId/ownership/restore';
  end if;

  return new;
end;
$fn$;

revoke all on function public.enforce_business_reactivation_needs_owner()
  from public, anon, authenticated;

drop trigger if exists trg_business_reactivation_needs_owner on public.businesses;

create trigger trg_business_reactivation_needs_owner
  before update of is_active on public.businesses
  for each row
  execute function public.enforce_business_reactivation_needs_owner();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. `enforce_owner_cannot_be_deleted`: LA FILA DE DUEÑO NO SE BORRA
--
-- La guarda del `BEFORE DELETE` se reescribe con UNA condición más. La que
-- estaba sigue igual: el dueño VIVO no se borra, porque el borrado de una
-- membresía es lógico y la fila queda para saber quién operó.
--
-- La que se agrega es la del dueño YA DADO DE BAJA: mientras el negocio lo
-- nombre como su dueño en `business_ownership`, la fila no se borra. Sin esto,
-- `update business_members set deleted_at = now()` —que la Task 3 dejó
-- permitido— seguido de un `delete` deja la fila de propiedad nombrando a
-- alguien que ya no tiene membresía: el huérfano silencioso, y sin ninguna
-- fila que lo delate.
--
-- Con la liberación, la fila de propiedad se borra EN LA MISMA TRANSACCIÓN que
-- archiva la membresía, así que después de una liberación el borrado es
-- limpieza de historia y antes de ella es el camino sin puerta.
--
-- El `to_regclass` es por la Task 10, como en la liberación: el día que
-- `business_ownership` no exista, la guarda se apaga sola en vez de romper
-- cada borrado de membresía.
create or replace function public.enforce_owner_cannot_be_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Una fila que NO es la del dueño no tiene nada que exigir acá. La de un
  -- `manager` o un `staff` no es el dueño de nada y se puede borrar como
  -- cualquier otra.
  if old.role <> 'owner'::public.business_member_role then
    return old;
  end if;

  -- EL DUEÑO VIVO NO SE BORRA. El borrado es lógico: la fila queda para saber
  -- quién operó en el negocio, y el alias queda quemado.
  if old.deleted_at is null then
    raise exception 'el dueño del negocio no se puede borrar; dá de baja la fila en vez de borrarla'
      using
        errcode = 'R0002',
        detail = format('business=%s member=%s', old.business_id, old.id),
        hint = 'el borrado es lógico: la fila queda para saber quién operó en el negocio';
  end if;

  -- Y EL DUEÑO YA DADO DE BAJA TAMPOCO, MIENTRAS EL NEGOCIO LO NOME COMO SU
  -- DUEÑO. Sin esta condición, archivar y borrar es un camino que deja la fila
  -- de propiedad apuntando a una persona que ya no está.
  if to_regclass('public.business_ownership') is not null then
    if exists (
      select 1
        from public.business_ownership o
       where o.business_id = old.business_id
         and o.owner_id = old.user_id
    ) then
      raise exception 'el dueño del negocio no se puede borrar mientras el negocio lo nombre como su dueño: liberá la propiedad primero'
        using
          errcode = 'R0002',
          detail = format('business=%s member=%s', old.business_id, old.id),
          hint = 'la liberación archiva la membresía y borra la fila de propiedad en la misma transacción';
    end if;
  end if;

  return old;
end;
$fn$;

revoke all on function public.enforce_owner_cannot_be_deleted()
  from public, anon, authenticated;