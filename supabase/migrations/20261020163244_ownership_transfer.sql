-- ─────────────────────────────────────────────────────────────────────────────
-- La transferencia de propiedad, y el invariante que la sostiene
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- Son TRES cambios, y los tres son la MISMA regla:
--
--   1. `transfer_business_ownership(business_id, member_id)`: la operación.
--   2. `enforce_business_keeps_an_owner()` + su trigger DIFERIDO: el invariante.
--   3. `enforce_owner_is_untouchable()` reescrito: la guarda que sobra.
--
-- ─── EL INVARIANTE, EN UNA FRASE ─────────────────────────────────────────────
--
-- **Un negocio ACTIVO siempre tiene un dueño vivo. Un negocio INACTIVO puede no
-- tenerlo.**
--
-- Es la misma regla que decide las tres cosas de este plan: la transferencia
-- (D1), la liberación de un negocio inactivo (D2) y la reactivación (que la
-- Task 5 pone en la base). Una sola frase, y por eso una sola implementación.
--
-- ─── POR QUÉ UN TRIGGER DIFERIDO Y NO UN `BEFORE` ────────────────────────────
--
-- La degradación y la promoción tienen que pasar en DOS sentencias: el índice
-- parcial `business_members_one_owner_per_business` comprueba fila por fila, así
-- que en una sola sentencia el orden de las filas no está garantizado y la
-- promoción puede chocar con un `23505`.
--
-- Con dos sentencias, un trigger `BEFORE` vería el estado INTERMEDIO —el
-- negocio sin dueño— y negaría una transferencia legítima. Un
-- `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` se evalúa AL COMMIT,
-- con el estado FINAL: la transferencia pasa, y una degradación suelta de un
-- negocio activo se aborta al commit.
--
-- ─── POR QUÉ LA GUARDA DE `status → 'disabled'` SE QUEDA EN EL `BEFORE` ───────
--
-- Porque no es una transferencia: es una revocación, y merece un error
-- INMEDIATO y con su mensaje. El trigger diferido no puede dar eso: el
-- `status` de una fila no dice si el negocio tiene dueño, y una desactivación
-- que llega al commit se confundiría con la degradación que la acompaña.
--
-- ─── LO QUE SE QUITA DE `enforce_owner_is_untouchable` ───────────────────────
--
-- Las dos guardas de degradación y de `deleted_at`. Las dos pasan a ser cosa
-- del trigger diferido, que mira el estado FINAL de la transacción y no el
-- estado de una fila.
--
-- El `trg_enforce_owner_cannot_be_deleted` (BEFORE DELETE) NO se toca: ya
-- acepta borrar un dueño archivado, que es lo que hace posible borrar el
-- negocio después de una liberación.
--
-- ─── LA TRANSFERENCIA NO ES UNA DEGRADACIÓN SUELTA ────────────────────────────
--
-- La función degrada al dueño saliente y promueve al receptor en la MISMA
-- transacción, y por eso el trigger diferido la deja pasar: al commit el
-- negocio tiene un dueño vivo y no hay nada que objetar.
--
-- Y el alcance del dueño saliente: se degrada a `manager` CON el alcance de
-- todas las sucursales del negocio. Un `manager` sin filas de alcance no
-- administra nada (§5.1 y D3), así que un dueño que entrega su negocio sin
-- alcance se queda con un panel vacío —que es exactamente el «no pierde el
-- negocio de un día para otro» del plan.
--
-- ─── `business_ownership` QUEDA COHERENTE MIENTRAS EXISTA ─────────────────────
--
-- La fila de propiedad pasa a apuntar al dueño nuevo en la MISMA transacción.
-- Sin esto, el dueño nuevo vería el negocio vacío en el móvil —que lee esa
-- tabla— y el dueño viejo seguiría viéndolo. Es un UPSERT y no un `update`: un
-- negocio sin fila de propiedad es un negocio que el móvil no leía, y después
-- de la transferencia tiene que leerse igual que los demás.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `transfer_business_ownership`: LA OPERACIÓN
--
-- `volatile security definer set search_path = ''`, y el cuerpo QUALIFICADO
-- todo: con el `search_path` vacío, un nombre sin esquema no resuelve, y un
-- nombre sin esquema que resuelve es un nombre que el día de mañana puede
-- resolver a otra cosa.
--
-- El ACL es `{postgres, service_role}`: la escriben el `pg_default_acl` del
-- proyecto y este `revoke`/`grant` explícito. `anon` y `authenticated` NO la
-- pueden ejecutar, aunque el móvil escriba directo a Supabase: la función es
-- la puerta, y una puerta que el cliente puede abrir no es una puerta.
--
-- Y el llamador NO es un argumento: es `auth.uid()`. Quien llama es el dueño
-- vivo de ese negocio, y la función lo comprueba ella misma. Una función que
-- recibiera «el dueño» como parámetro dejaría que cualquiera le pidiera
-- transferir la propiedad de cualquiera.

create or replace function public.transfer_business_ownership(
  p_business_id uuid,
  p_new_owner_member_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_caller   uuid;
  v_previous record;
  v_next     record;
begin
  -- 1. EL LLAMADOR. `auth.uid()` es el `sub` del JWT: si no hay, no hay
  -- llamador, y una transferencia sin llamador no es una transferencia.
  v_caller := auth.uid();
  if v_caller is null then
    raise exception 'la transferencia de propiedad necesita un llamador verificado'
      using
        errcode = 'R0004',
        detail = format('business=%s', p_business_id),
        hint = 'la transferencia la hace el dueño del negocio, desde su sesión';
  end if;

  -- 2. EL DUEÑO VIVO DE ESE NEGOCIO. `role = 'owner'`, `status = 'active'` y
  -- `deleted_at is null`: las tres mitades. Un dueño pausado no administra
  -- nada, y un dueño archivado ya no es el dueño de nada.
  select m.id, m.user_id
    into v_previous
    from public.business_members m
   where m.business_id = p_business_id
     and m.user_id = v_caller
     and m.role = 'owner'::public.business_member_role
     and m.status = 'active'::public.business_member_status
     and m.deleted_at is null
   limit 1;

  if not found then
    raise exception 'sólo el dueño del negocio puede transferir la propiedad'
      using
        errcode = 'R0004',
        detail = format('business=%s member=%s', p_business_id, v_caller),
        hint = 'la transferencia la hace el dueño vivo del negocio';
  end if;

  -- 3. EL RECEPTOR: un acceso VIVO de ESE negocio. Un id de otro negocio, una
  -- fila dada de baja y una fila pausada son tres formas de la misma
  -- respuesta: no hay a quién transferirle.
  select m.id, m.user_id
    into v_next
    from public.business_members m
   where m.id = p_new_owner_member_id
     and m.business_id = p_business_id
     and m.status = 'active'::public.business_member_status
     and m.deleted_at is null
   limit 1;

  if not found then
    raise exception 'el receptor tiene que ser un acceso vivo de este negocio'
      using
        errcode = 'R0004',
        detail = format('business=%s member=%s', p_business_id, p_new_owner_member_id),
        hint = 'un acceso dado de baja, pausado o de otro negocio no puede recibir la propiedad';
  end if;

  -- Y el receptor no puede ser el dueño actual: transferirse la propiedad a
  -- sí mismo no es una transferencia, es un no-op con dos escrituras.
  if v_next.id = v_previous.id then
    raise exception 'el receptor no puede ser el dueño actual: la propiedad se transfiere a otro acceso'
      using
        errcode = 'R0004',
        detail = format('business=%s member=%s', p_business_id, v_next.id),
        hint = 'elegí otro acceso vivo del negocio como receptor';
  end if;

  -- 4. DEGRADAR AL DUEÑO SALIENTE. La degradación por sí sola la negaba
  -- `enforce_owner_is_untouchable`; acá la hace la operación que la hace
  -- legal, y por eso el guard del dueño ya no la niega.
  update public.business_members
     set role = 'manager'::public.business_member_role,
         updated_at = now()
   where id = v_previous.id;

  -- 5. EL ALCANCE DEL DUEÑO SALIENTE: todas las sucursales del negocio.
  --
  -- El `do update` y no el `do nothing` es deliberado: una fila de alcance
  -- que EXISTE pero está archivada es una sucursal que el dueño saliente no
  -- alcanzaría, y un `do nothing` dejaría al `manager` con un alcance
  -- incompleto —que es un `manager` que no administra nada.
  insert into public.business_member_locations (member_id, location_id)
  select v_previous.id, l.id
    from public.business_locations l
   where l.business_id = p_business_id
  on conflict (member_id, location_id)
  do update set deleted_at = null, updated_at = now();

  -- 6. PROMOVER AL RECEPTOR. Ahora sí, y en la misma transacción: el índice
  -- parcial `business_members_one_owner_per_business` deja pasar una fila
  -- `owner` por negocio, y la fila que ocupaba el asiento ya es `manager`.
  update public.business_members
     set role = 'owner'::public.business_member_role,
         updated_at = now()
   where id = v_next.id;

  -- 7. LA COHERENCIA CON `business_ownership`, mientras la tabla exista.
  insert into public.business_ownership (business_id, owner_id)
  values (p_business_id, v_next.user_id)
  on conflict (business_id)
  do update set owner_id = excluded.owner_id, updated_at = now();

  -- 8. LA RESPUESTA: los cinco identificadores, y nada más. No hay ningún
  -- dato de la fila del dueño saliente en la respuesta —su `alias` espeja su
  -- correo— porque la respuesta es de la operación, no del roster.
  return jsonb_build_object(
    'business_id', p_business_id,
    'previous_owner_member_id', v_previous.id,
    'previous_owner_user_id', v_previous.user_id,
    'new_owner_member_id', v_next.id,
    'new_owner_user_id', v_next.user_id
  );
end;
$fn$;

revoke all on function public.transfer_business_ownership(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.transfer_business_ownership(uuid, uuid)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. `enforce_business_keeps_an_owner`: EL INVARIANTE, AL COMMIT
--
-- `security definer` porque el conteo tiene que ver TODAS las membresías del
-- negocio, no las que la RLS le deja ver a quien escribe: un trigger que
-- corriera como el invocante contaría cero dueño siempre que el invocante no
-- fuera el dueño, y el invariante no se cumpliría nunca.
--
-- El conteo es de DUEÑOS VIVOS: `role = 'owner'`, `status = 'active'` y
-- `deleted_at is null`. Las tres mitades, y no una: un dueño archivado es
-- historia, y un dueño pausado no administra nada.
--
-- Y el invariante es de EXACTAMENTE UNO. El índice parcial
-- `business_members_one_owner_per_business` garantiza que no haya dos filas
-- `owner` vivas a la vez, así que «exactamente uno» y «al menos uno» son la
-- misma cosa —pero la forma exacta es la que dice la regla, y la que va a
-- seguir diciendo cuando el índice cambie.

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

    select count(*)::int into v_live
      from public.business_members m
     where m.business_id = v_business_id
       and m.role = 'owner'::public.business_member_role
       and m.status = 'active'::public.business_member_status
       and m.deleted_at is null;

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

-- El trigger se crea DIFERIDO y NO POR FILA DE STATEMENT: `for each row` y
-- `deferrable initially deferred`. Es lo que permite que la transferencia —
--que degrada y promueve en dos sentencias— pase, y lo que hace que una
-- degradación SUELTA se aborte al commit y no en la sentencia.
--
-- El `drop trigger if exists` va porque la migración se aplica más de una vez
-- en la historia de este repositorio —cada defecto encontrado después de
-- aplicar es una migración nueva— y un `create constraint trigger` sobre un
-- nombre existente falla.
drop trigger if exists trg_business_keeps_an_owner on public.business_members;

create constraint trigger trg_business_keeps_an_owner
  after update on public.business_members
  deferrable initially deferred
  for each row
  execute function public.enforce_business_keeps_an_owner();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. `enforce_owner_is_untouchable`: LO QUE SOBRA
--
-- Se queda la guarda de `status → 'disabled'`, y con su mensaje. Se van las dos
-- guardas que miraban el ESTADO DE LA FILA —la degradación y la baja— porque
-- lo que decide si el negocio tiene dueño es el estado FINAL de la
-- transacción, y eso lo mira el trigger diferido.
--
-- El mensaje de la guarda que queda cambia, y tiene que cambiar: el texto
-- anterior decía «la transferencia de propiedad no existe en esta versión», y
-- desde esta migración es FALSO. Un mensaje que manda al operador a una puerta
-- que no existe es peor que uno que no da ninguna: el que lo lea va a
-- buscar la transferencia, no la va a encontrar, y vuelve a leer el mismo
-- mensaje sin entender nada.

create or replace function public.enforce_owner_is_untouchable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Una fila que NO es la del dueño no tiene nada que exigir acá. La pausa y la
  -- baja son la revocación real del acceso de alguien que se va (§8), y un
  -- trigger que las negara dejaría al negocio sin poder despedir a nadie.
  if old.role <> 'owner'::public.business_member_role then
    return new;
  end if;

  -- NINGÚN ROL DESACTIVA AL DUEÑO (§5.4). La guarda mira la TRANSICIÓN y no
  -- el estado de destino: una fila que ya nació desactivada no está enclavada
  -- —`set status = 'active'` la revive— y una escritura que no toca `status`
  -- no dispara nada.
  if old.status is distinct from new.status
     and new.status = 'disabled'::public.business_member_status then
    raise exception 'el dueño del negocio no se puede desactivar: transferí la propiedad a otro acceso primero'
      using
        errcode = 'R0002',
        detail = format('business=%s member=%s', new.business_id, old.id),
        hint = 'ningún rol desactiva al dueño; la propiedad se transfiere, no se desactiva';
  end if;

  -- La degradación y la baja del dueño ya NO se niegan acá: las decide el
  -- trigger diferido, que mira el estado final de la transacción. Un negocio
  -- ACTIVO no puede quedar sin dueño; uno INACTIVO puede.
  return new;
end;
$fn$;

revoke all on function public.enforce_owner_is_untouchable() from public, anon, authenticated;