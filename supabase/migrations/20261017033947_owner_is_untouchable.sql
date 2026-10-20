-- ─────────────────────────────────────────────────────────────────────────────
-- Un dueño por negocio, y ningún rol lo desactiva
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- La versión larga de este razonamiento —lo que mide el índice, lo que mide el
-- trigger, por qué degradar pasa y por qué el `INSERT` no lo ve nadie, y la
-- cadena de `20261015034230` → `…00829` → `…00934` que estos cuerpos
-- superseden— está en la sección de esta migración en ese README.
--
-- ─── EL ÍNDICE ───────────────────────────────────────────────────────────────
--
-- `enforce_business_member_limit` sale antes de contar cuando
-- `new.role = 'owner'`: un dueño nunca consume cupo (§4.5). Con la escritura
-- pasando por `service_role` —que es lo que va a hacer el `POST /staff` del Plan
-- 2, porque el alta necesita `admin.createUser`— eso no es «el dueño no paga
-- plaza» sino una salida gratis y sin tope: promover a un empleado, insertar, y
-- repetir. El conteo medido nunca pasa de 2 y el equipo crece sin límite.
--
-- El predicado es `deleted_at is null` y no un UNIQUE sobre `(business_id,
-- role)`: un dueño dado de baja deja de contar para que la fila siga siendo
-- historia, que es el borrado lógico del §8. Y NO filtra por `status`, a
-- propósito —la unicidad que hay que proteger es «no haya dos», y un dueño
-- desactivado no es «dueño de facto», es un hueco que se podría llenar por la
-- espalda—.
--
-- ─── EL TRIGGER ─────────────────────────────────────────────────────────────
--
-- `BEFORE UPDATE` y no `BEFORE INSERT OR UPDATE`: en el `insert` la unicidad ya
-- la garantiza el índice, y un trigger que sólo mira la transición `old → new`
-- estorbaría debajo del backfill del Plan 1 y de cualquier recarga de la tabla.
--
-- La condición de la degradación está escrita con la intención primero y los
-- hechos después: `owner` → `manager` PASA, porque es la única salida que el §5.4
-- deja («ningún rol puede desactivar al dueño» no dice «y nadie puede dejar de
-- serlo») y la que va a necesitar la transferencia de propiedad. Lo que no pasa
-- es que la fila del dueño se desactive o se dé de baja.
--
-- ─── R0001 Y R0002 ──────────────────────────────────────────────────────────
--
-- `P0001` es la clase genérica de Postgres. Los errores de negocio de esta base
-- llevan prefijo `R`, y son dos códigos y no uno porque son dos reglas y la UI
-- reacciona distinto a cada una: con un `R0001` único sabría «fue una regla de
-- negocio» y tendría que volver a leer la prosa para saber cuál, que es el
-- defecto que este código vino a cerrar, mudado de lugar.
--
--     R0001   el tope del plan       → «subí de plan»
--     R0002   el dueño es intocable  → «no se puede, y no es culpa del plan»
--
-- El `detail` lleva los números que la prosa no lleva —negocio, plan, tope y el
-- conteo que lo rebotó— y el `message` no pierde ni una coma de la cadena del
-- Plan 1. El `USING` va ACOMPAÑANDO al formato y no reemplazándolo: `MESSAGE =`
-- con `format()` no funciona con los marcadores `%` sueltos de un `raise`, y
-- escribir `format('el plan % admite…')` revienta en la primera negativa con
-- «unrecognized format() type specifier " "». Medido, no supuesto.

create unique index business_members_one_owner_per_business
  on public.business_members (business_id)
  where role = 'owner' and deleted_at is null;

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

  -- La DEGRADACIÓN pasa. Las tres condiciones son necesarias y ninguna alcanza
  -- sola: `new.role` porque degradar es lo permitido, `new.deleted_at is null`
  -- porque «bajar de rol y dar de baja en la misma escritura» es una baja con
  -- dos pasos, y `old.deleted_at is null` porque una fila ya dada de baja no
  -- tiene una transición que proteger.
  if new.role <> 'owner'::public.business_member_role
     and new.deleted_at is null
     and old.deleted_at is null then
    return new;
  end if;

  -- A partir de acá la fila SIGUE siendo la del dueño, y hay dos salidas que se
  -- niegan: desactivar y dar de baja. Las dos dejan al negocio sin nadie que lo
  -- administre, que es el «nadie se queda fuera de su negocio» del §5.4.
  if new.status = 'disabled'::public.business_member_status then
    raise exception 'el dueño del negocio no se puede desactivar; degradalo a manager primero'
      using
        errcode = 'R0002',
        detail = format('business=%s member=%s', new.business_id, old.id),
        hint = 'ningún rol desactiva al dueño; la transferencia de propiedad no está en la v1';
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    raise exception 'el dueño del negocio no se puede dar de baja; degradalo primero'
      using
        errcode = 'R0002',
        detail = format('business=%s member=%s', new.business_id, old.id),
        hint = 'bajale el rol antes de darlo de baja';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_enforce_owner_is_untouchable on public.business_members;
create trigger trg_enforce_owner_is_untouchable
  before update on public.business_members
  for each row execute function public.enforce_owner_is_untouchable();

-- Los dos cuerpos siguientes son los de `20261016000829` (miembros) y de
-- `20261016000934` (sucursales) —el último es el estado terminal de la cadena—
-- con el `raise` del tope reescrito. Todo lo demás es el mismo cuerpo, carácter
-- por carácter: el plan se sigue resolviendo antes de comprobar la feature, el
-- `v_agrega` sigue siendo el de `…00829` y el `case` sigue nombrando los tres
-- planes uno por uno con su `else` ruidoso. Los otros dos `raise` de esos
-- cuerpos NO cambian de código: no son el tope, y el de «el plan % no tiene
-- límites definidos» es un defecto de catálogo, no una regla de negocio.
create or replace function public.enforce_business_location_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
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

  if not public.business_has_feature(new.business_id, 'staff_access'::public.business_feature) then
    raise exception 'el plan % no incluye accesos de personal', v_plan;
  end if;

  case v_plan
    when 'free'     then v_limit := 1;
    when 'pro'      then v_limit := 5;
    when 'pro_plus' then v_limit := null;   -- pro_plus no tiene tope (§4.5)
    else raise exception 'el plan % no tiene límites definidos', v_plan;
  end case;

  if v_limit is null then
    return new;
  end if;

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

  -- Las demás filas, en el estado en que están. En un `UPDATE` la fila que se
  -- está tocando sigue en la tabla con sus valores viejos, así que contarla
  -- sería contar la escritura dos veces.
  select count(*)::int
    into v_otros
    from public.business_locations l
   where l.business_id = new.business_id
     and l.is_active
     and (tg_op = 'INSERT' or l.id <> new.id);

  v_despues := v_otros + case when v_agrega then 1 else 0 end;

  -- La comparación sólo cuando la escritura CRECIÓ. Un negocio por encima de su
  -- plan puede seguir operándolo entero; lo que no puede es pasarse más.
  if v_despues > v_otros and v_despues > v_limit then
    -- El sustantivo es un ARGUMENTO, no un `%s`: en plpgsql el marcador es `%`
    -- y nada más. El plural lo decide el número, y el único singular del
    -- catálogo es el 1 de `free`.
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
$fn$;

create or replace function public.enforce_business_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
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
  --
  -- Y desde esta migración esto ya no es la puerta de atrás que era: el índice de
  -- un dueño por negocio cierra el otro lado de esa salida.
  if new.role = 'owner'::public.business_member_role then
    return new;
  end if;

  v_plan := public.business_plan_of(new.business_id);

  if not public.business_has_feature(new.business_id, 'staff_access'::public.business_feature) then
    raise exception 'el plan % no incluye accesos de personal', v_plan;
  end if;

  case v_plan
    when 'free'     then v_limit := 2;
    when 'pro'      then v_limit := 20;
    when 'pro_plus' then v_limit := null;   -- pro_plus no tiene tope (§4.5)
    else raise exception 'el plan % no tiene límites definidos', v_plan;
  end case;

  if v_limit is null then
    return new;
  end if;

  -- ¿ESTA escritura está METIENDO una fila en el conteo? No es lo mismo que
  -- «¿la fila queda contando?»: cambiar el `label`, el `alias`, el `role` o el
  -- `status` de un acceso que ya existe la deja contando igual, y eso no es
  -- crecimiento. Sólo suma cuando la fila ANTES no contaba y ahora sí.
  --
  -- Y la fila que esta escritura toca sigue en la tabla con sus valores viejos,
  -- así que `v_otros` la excluye por `id`.
  if tg_op = 'INSERT' then
    v_agrega := new.deleted_at is null;
  else
    v_agrega := new.deleted_at is null
               and (old.role = 'owner'::public.business_member_role
                    or old.deleted_at is not null
                    or old.business_id is distinct from new.business_id);
  end if;

  select count(*)::int
    into v_otros
    from public.business_members m
   where m.business_id = new.business_id
     and m.role <> 'owner'::public.business_member_role
     and m.deleted_at is null
     and (tg_op = 'INSERT' or m.id <> new.id);

  v_despues := v_otros + case when v_agrega then 1 else 0 end;

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
$fn$;

-- Los dos triggers no se tocan: los de `20261015034230` siguen apuntando a estos
-- mismos nombres de función y el `create or replace` conserva el OID y el ACL.
--
-- Y el revoke se cierra contra `authenticated`. `20261015034230` revocaba de
-- `public, anon`; hoy eso no cambia nada —`pg_default_acl` del proyecto da
-- `{postgres, service_role}` a las funciones nuevas de `public`— pero el revoke
-- queda indefenso por sí mismo: un default que se ampliara les devolvería
-- EXECUTE a los triggers sin que nadie lo pidiera.
revoke all on function public.enforce_owner_is_untouchable() from public, anon, authenticated;
revoke all on function public.business_plan_of(uuid) from public, anon, authenticated;
revoke all on function public.enforce_business_location_limit() from public, anon, authenticated;
revoke all on function public.enforce_business_member_limit() from public, anon, authenticated;