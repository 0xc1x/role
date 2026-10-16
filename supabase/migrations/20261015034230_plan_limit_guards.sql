-- ─────────────────────────────────────────────────────────────────────────────
-- Los límites del plan bloquean crecer, nunca operar
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── POR QUÉ UN TRIGGER Y NO UN GUARD ───────────────────────────────────────
--
-- El panel escribe directo a Supabase, así que un límite comprobado en el API
-- se salta con un `insert` desde el dispositivo. El §5.3 lo dice y por eso los
-- límites viven en `BEFORE INSERT OR UPDATE`: la tabla es la frontera, no la
-- ruta que se decidió usar para llegar a ella.
--
-- Y son `BEFORE INSERT OR UPDATE`, no `BEFORE INSERT OR UPDATE OR DELETE`, y
-- tampoco una statement trigger: no hay ningún camino por el que un `select` o
-- un `delete` toque esta función. Es la diferencia entre un tope y una condena,
-- y es la razón por la que el §5.3 dice que un negocio por encima de su plan
-- sigue operando.
--
-- ─── EL CUENTO describe LA SITUACIÓN DESPUÉS DE LA ESCRITURA ─────────────────
--
-- El trigger corre en un `UPDATE` tanto como en un `INSERT`, así que un conteo
-- literal de las filas que ya existen rompe la promesa central del §5.4. El
-- caso medido: un negocio con TRES sucursales bajo `free` —que es lo que hay en
-- producción: 13 negocios con sucursales, todos en `free`, y uno con tres—
-- renombra una y `3 >= 1` lo revienta con un error de plan. Eso es "meterle un
-- lock a una panadería un viernes a las 5".
--
-- El conteo entonces son dos números:
--
--   v_otros    las filas que ya contaban, SIN la fila que esta escritura está
--              tocando —`l.id <> new.id`, porque en un `UPDATE` la fila que va
--              a cambiar todavía está en la base con su valor viejo—
--   v_despues  v_otros más UNO si esta escritura es la que está ACTIVANDO una
--              fila que no contaba
--
-- y la comparación sólo se hace cuando `v_despues > v_otros`: cuando la
-- escritura no agrega nada, no hay nada que rebote. Renombrar, cambiar una
-- dirección, corregir el `label` de un acceso o apagar una sucursal pasan
-- siempre; insertar una sucursal, reabrir una cerrada y dar de alta un acceso se
-- miden contra el tope. Eso es "los límites son de crecimiento hacia adelante,
-- nunca una sentencia retroactiva", dicho como código.
--
-- Los tres sentidos van probados: renombrar por encima del tope pasa, insertar
-- una cuarta sucursal rebota, y reabrir una sucursal cerrada con el tope encima
-- también —porque apagar una sucursal no puede ser la manera de abrir la
-- siguiente.
--
-- ─── EL PLAN, RESUELTO UNA SOLA VEZ Y ANTES DE QUE LO NECESITE ──────────────
--
-- `business_plan_of` es ahora la única definición de "qué plan tiene este
-- negocio". Antes de esta migración esa pregunta la contestaban DOS lugares: la
-- subconsulta de `business_has_feature`, que filtra `deleted_at is null`, y el
-- `left join` que los triggers traían para poder poner el plan en el mensaje.
-- Dos respuestas a una pregunta es la forma más corta de que se separen, y se
-- separaban: una fila de plan borrada le contestaba `free` a la comprobación y
-- `pro` al mensaje, así que el mensaje le decía al dueño que estaba pagando un
-- plan que no tenía. Ahora los dos leen la misma función y no pueden discrepar.
--
-- Y el orden importa por una razón que no se ve en el resultado: el `raise` que
-- nombra el plan se ejecuta ANTES de que el plan esté resuelto si el orden está
-- al revés, y sale "el plan  no incluye accesos de personal". Ese texto es el
-- que la UI le enseña a quien se le frenó el crecimiento, así que la resolución
-- va primero. Es un orden invisible a un `select`, y por eso hay una guarda de
-- catálogo que lo mira en `prosrc`.
--
-- ─── LA ASIMETRÍA, Y POR QUÉ NO ES UNA INCONSISTENCIA ───────────────────────
--
-- `business_members`: `NEW.role = 'owner'` sale antes de contar, porque un dueño
-- nunca consume cupo (§4.5). El conteo excluye al dueño por `role`, no por su
-- `user_id`: un negocio con dos dueños —en producción hay uno con seis
-- negocios— seguiría teniendo un solo dueño que no cuenta.
--
-- `business_locations`: NO hay esa salida. Una sucursal nueva consume cupo la
-- cree quien la cree, y eso incluye al dueño. Lo que decide QUIÉN puede crear
-- una sucursal es la policy de INSERT del §6.2, que es de dueño y gerente, y la
-- aplica el API en el Plan 2 —esta migración no le agrega un chequeo de rol
-- que el diseño deja deliberadamente en otro sitio.
--
-- ─── LO QUE ESTA MIGRACIÓN NO HACE ──────────────────────────────────────────
--
-- No toca `business_ownership` ni nada de ese territorio: el `drop table` es de
-- un plan posterior. No toca `business_has_feature`'s catálogo —la celda plan →
-- feature es la del §4.5 y no se mueve—: lo que se mueve es de dónde lee el
-- plan. No toca `status` en el conteo de miembros: un acceso PAUSADO sigue
-- consumiendo su plaza, que es lo que dice el §4.5, y la distinción entre pausa
-- y baja la hace `deleted_at`.
--
-- ─── MEDIDO EN PRODUCCIÓN ANTES DE APLICAR ──────────────────────────────────
--
--   negocios con sucursales:  13   ·   en `free`: 13   ·   con más de una: 1
--   membresías vivas que no son de dueño:  0
--
-- O sea que este trigger no le frena nada a nadie que hoy esté operando: al que
-- tiene tres sucursales le deja renombrarlas y le impide la cuarta, que es
-- literalmente lo que el §5.4 describe.

create or replace function public.business_plan_of(p_business_id uuid)
returns public.business_plan_code
language sql
stable
security definer
set search_path = ''
as $$
  -- Ausencia de fila y fila borrada son la misma cosa: `free`. El
  -- `deleted_at is null` es lo que impide que un plan retirado siga
  -- concediendo features —y contando topes— desde la fila que lo dejó atrás.
  select coalesce(
    (select bps.plan_code
       from public.business_plans_state bps
      where bps.business_id = p_business_id
        and bps.deleted_at is null),
    'free'::public.business_plan_code
  )
$$;

-- `business_has_feature` pasa a leer el plan de `business_plan_of`. El catálogo
-- no se mueve: es el del §4.5, celda por celda, y el `else false` del final
-- sigue siendo por el enum y no por descuido, para que un plan nuevo no
-- conceda features mientras nadie decidió cuánto cuesta cada una.
--
-- `create or replace` conserva el ACL, así que esta migración no lleva ningún
-- `grant` ni `revoke` sobre esta función.
create or replace function public.business_has_feature(p_business_id uuid, p_feature public.business_feature)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- This mapping MUST move in lockstep with BUSINESS_PLAN_FEATURES in
  -- packages/commons (src/business/enums/business-plan.ts). Any change to the
  -- catalog lands here in the same commit, or the trigger on growth and the
  -- API disagree on which tier carries which feature.
  select case public.business_plan_of(p_business_id)
    when 'free' then p_feature = 'staff_access'::public.business_feature
    when 'pro' then p_feature in ('staff_access'::public.business_feature, 'payments'::public.business_feature)
    when 'pro_plus' then p_feature in ('staff_access'::public.business_feature, 'payments'::public.business_feature, 'visibility_plus'::public.business_feature)
    else false
  end
$$;

-- ─── SUCURSALES ──────────────────────────────────────────────────────────────
--
-- `free` 1, `pro` 5, `pro_plus` sin tope: el §4.5. Los dos números en el
-- mensaje son los del catálogo, y el `case` de abajo es su única copia para
-- esta tabla —la de miembros está en la otra función y lleva OTRO número, que
-- es lo que el §4.5 dice que sea, no una contradicción.

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

  v_limit := case v_plan
    when 'free' then 1
    when 'pro'  then 5
    else null
  end;
  if v_limit is null then
    return new;                      -- pro_plus: sin tope
  end if;

  -- ¿ESTA escritura está activando una sucursal? Solo eso agrega una fila al
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
    -- El plural del sustantivo: el único número singular del catálogo es el 1 de
    -- `free` en sucursales, y este texto lo lee un dueño al que se le acaba de
    -- frenar algo.
    raise exception 'el plan % admite hasta % %s, no más', v_plan, v_limit,
      case when v_limit = 1 then 'sucursal' else 'sucursales' end;
  end if;

  return new;
end;
$fn$;

-- ─── MIEMBROS ───────────────────────────────────────────────────────────────
--
-- `free` 2, `pro` 20, `pro_plus` sin tope. Aquí el dueño no consume cupo y sale
-- antes de contar: un negocio `free` es dueño + 2 empleados, no 3 personas.
--
-- Y esto es defensa en profundidad, no la frontera: nada escribe esta tabla
-- desde un cliente (§6.3). El que de verdad importa es el de `business_locations`,
-- porque el panel inserta sucursales directo a Supabase.

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
  if new.role = 'owner'::public.business_member_role then
    return new;
  end if;

  v_plan := public.business_plan_of(new.business_id);

  if not public.business_has_feature(new.business_id, 'staff_access'::public.business_feature) then
    raise exception 'el plan % no incluye accesos de personal', v_plan;
  end if;

  v_limit := case v_plan
    when 'free' then 2
    when 'pro'  then 20
    else null
  end;
  if v_limit is null then
    return new;                      -- pro_plus: sin tope
  end if;

  -- Misma cuenta que en sucursales: sólo cuenta lo que ESTA escritura agrega.
  -- Cambiar el `label`, el `alias` o el `role` de un acceso que ya existe no
  -- agrega ninguna fila y por eso no puede rebotar. `status` NO entra: un
  -- acceso pausado sigue ocupando su plaza, que es lo que dice el §4.5.
  if tg_op = 'INSERT' then
    v_agrega := new.deleted_at is null;
  else
    v_agrega := new.deleted_at is null
               and (old.role is distinct from 'owner'::public.business_member_role
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

  if v_despues > v_otros and v_despues > v_limit then
    raise exception 'el plan % admite hasta % miembros, no más', v_plan, v_limit;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_enforce_location_limit on public.business_locations;
create trigger trg_enforce_location_limit
  before insert or update on public.business_locations
  for each row execute function public.enforce_business_location_limit();

drop trigger if exists trg_enforce_member_limit on public.business_members;
create trigger trg_enforce_member_limit
  before insert or update on public.business_members
  for each row execute function public.enforce_business_member_limit();

-- Ninguna de las tres es ejecutable por un cliente: son de trigger y de
-- interno. `business_has_feature` conserva su ACL por el `create or replace`.
revoke all on function public.business_plan_of(uuid) from public, anon;
revoke all on function public.enforce_business_location_limit() from public, anon;
revoke all on function public.enforce_business_member_limit() from public, anon;