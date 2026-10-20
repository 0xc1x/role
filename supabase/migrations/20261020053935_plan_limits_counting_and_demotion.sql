-- ─────────────────────────────────────────────────────────────────────────────
-- El trigger de sucursales recupera el conteo, y la degradación no es un tope
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- Esto SUPERSEDE a `20261020052952_plan_feature_refusal_on_growth`, que está
-- sellado: su `md5sum` es `d989274db916cef0957681a7104df457` y ese es el
-- `md5(statements[1])` de su fila del ledger. Dos archivos y un estado final.
--
-- ─── 1. EL CONTEO DE SUCURSALES, QUE SE HABÍA QUEDADO AFUERA ─────────────────
--
-- El cuerpo de `enforce_business_location_limit` que la migración anterior
-- escribió se comió el `select count(*) into v_otros` —el bloque que cuenta las
-- sucursales activas del negocio— y sin él `v_otros` y `v_despues` quedaban en
-- `null`, la comparación del tope nunca era cierta, y el trigger NO CONTABA NADA.
--
-- Un trigger que no cuenta no rechaza: los diez tests de límites de este
-- archivo lo PCTaron en la primera pasada, y un trigger de topes que no topa es
-- peor que uno que topa mal, porque no se nota.
--
-- El bloque vuelve, carácter por carácter, al de `20261017033947`.
--
-- ─── 2. UNA DEGRADACIÓN NO ES UN TOPE ────────────────────────────────────────
--
-- `trg_enforce_member_limit` corre ANTES que `trg_enforce_owner_is_untouchable`
-- —el orden de los triggers de Postgres es el del nombre— y hasta ahora una
-- degradación de dueño en un negocio que estaba en el tope moría con el
-- `R0001` del plan: «el plan free admite hasta 2 miembros, no más».
--
-- Es un mensaje que manda al operador a la puerta equivocada. La degradación no
-- tiene nada que ver con el plan: está cerrada por otra invariante —el dueño no
-- se degrada— y la respuesta que tiene que ver es `R0002`.
--
-- Por eso la degradación sale ANTES de contar. No crece, no consume plaza y no
-- toca el tope: la fila no llega a cambiar de rol, y el operador recibe la
-- negativa del dueño y no la del plan.
--
-- Lo que NO se toca: el conteo por `role` del §4.5 sigue contando a los dueños
-- como lo que son —no consumen plaza— y la condición `old.role = 'owner'` de
-- `v_agrega` sigue ahí, para el día en que exista una transferencia de
-- propiedad. Lo que cambia es que hoy esa condición no se puede alcanzar.

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

  -- LA FEATURE, Y SOLO CUANDO LA ESCRITURA CRECE.
  --
  -- Un plan sin `staff_access` no puede CREAR accesos nuevos —crecer es lo que
  -- el plan no compra—, pero los que ya existen siguen funcionando: cambiar la
  -- etiqueta, pausar, dar de baja, sellar la sesión. Eso es el §5.3.
  if v_agrega
     and not public.business_has_feature(new.business_id, 'staff_access'::public.business_feature) then
    raise exception 'el plan % no incluye accesos de personal', v_plan
      using
        errcode = 'R0001',
        detail = format('business=%s plan=%s feature=%s',
                        new.business_id, v_plan, 'staff_access'),
        hint = 'subí de plan para administrar el equipo';
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

  -- LA FEATURE, Y SOLO CUANDO LA ESCRITURA CRECE. Lo mismo que en los miembros,
  -- y por la misma razón: el §5.3 bloquea crecer, no operar.
  if v_agrega
     and not public.business_has_feature(new.business_id, 'staff_access'::public.business_feature) then
    raise exception 'el plan % no incluye accesos de personal', v_plan
      using
        errcode = 'R0001',
        detail = format('business=%s plan=%s feature=%s',
                        new.business_id, v_plan, 'staff_access'),
        hint = 'subí de plan para administrar el equipo';
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

  -- EL CONTEO. Sin este `select`, `v_otros` y `v_despues` quedan en `null`, la
  -- comparación del tope nunca es cierta y el trigger no rechaza NADA. Es el
  -- bloque que `20261017033947` traía y que la migración anterior se comió.
  select count(*)::int
    into v_otros
    from public.business_locations l
   where l.business_id = new.business_id
     and l.is_active
     and (tg_op = 'INSERT' or l.id <> new.id);

  v_despues := v_otros + case when v_agrega then 1 else 0 end;

  -- La comparación sólo cuando la escritura CRECIÓ. Un negocio por encima de su
  -- plan puede seguir operarlo entero; lo que no puede es pasarse más.
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