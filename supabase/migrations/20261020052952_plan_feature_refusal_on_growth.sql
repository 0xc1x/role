-- ─────────────────────────────────────────────────────────────────────────────
-- La feature del plan se consulta cuando la escritura CRECE, y su negativa es
-- una negativa de plan (R0001) y no el `P0001` genérico de Postgres
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- Esto SUPERSEDE, para los dos cuerpos de límites, a `20261017033947_owner_is_untouchable`
-- —que está sellado: su `md5sum` es `41a16c7fbcbd973f4990dc614b4f6a95` y ese es
-- el `md5(statements[1])` de su fila del ledger—, que a su vez los traía de
-- `20261016000829_plan_limit_guard_counting_and_message` y
-- `20261016000934_plan_limit_message_suffix`. La cadena de topes queda así:
-- `…15034230` → `…16000829` → `…16000934` → `…17033947` → esta.
--
-- ─── POR QUÉ LA COMPROBACIÓN DE LA FEATURE SE MUEVE ───────────────────────────
--
-- El §5.3 dice, con todas las letras: «Los triggers solo disparan en escritura.
-- Nunca bloquean lectura ni operación. Si a un negocio le baja el plan, los
-- accesos que ya creó siguen funcionando; lo que se bloquea es crecer.»
--
-- El cuerpo NO decía eso. La comprobación de `business_has_feature` estaba
-- antes de todo, y un trigger corre en CADA escritura: cambiar la etiqueta de un
-- acceso, pausarlo, cambiarle el alias, o sellarle la sesión a un empleado eran
-- todos «escrituras» y todos rebotaban con «el plan % no incluye accesos de
-- personal». El §5.3 llama a eso «bloquear la operación», y lo es.
--
-- La forma correcta es la misma que ya usa el tope: la comparación ocurre
-- «sólo cuando la escritura CRECIÓ». El crecimiento ya se calculaba —`v_agrega`
--—, y lo que faltaba era que la feature se consultara con esa misma pregunta
-- delante. Ahora las dos reglas del plan se preguntan lo mismo: «¿esta escritura
-- mete una fila nueva en el conteo?».
--
-- ─── Y POR QUÉ EL CÓDIGO ES `R0001` ───────────────────────────────────────────
--
-- El `raise` de la feature llevaba `P0001`, que es la clase genérica de
-- Postgres: un `raise exception` sin `USING`. El README de esta migración lo
-- dejó escrito —«el plan % no incluye accesos de personal es inalcanzable hoy
-- porque todos los planes dan `staff_access`… alcanzarlo sería el momento de
-- revisarlo»— y este es el momento: la API consulta la feature antes de cada
-- alta (§5.1), así que la negativa ya es alcanzable.
--
-- Y la negativa ES una negativa de plan: el plan es la razón, y la respuesta es
-- «subí de plan». `R0001` es exactamente ese código, y la API ya lo traduce a un
-- 422 con el mensaje y los números del `detail`. Un `P0001` sin traducir llega
-- al panel como un 500.
--
-- ─── LO QUE NO CAMBIA ────────────────────────────────────────────────────────
--
-- El dueño sigue saliendo antes que el plan y antes que la feature: nunca
-- consume cupo (§4.5). El `case v_plan` sigue nombrando los tres planes uno por
-- uno, con su `else` ruidoso. La comparación del TOPE sigue siendo la misma
-- (`v_despues > v_otros and v_despues > v_limit`), con su `R0001` y su
-- `detail`. Y el plan se sigue resolviendo con `business_plan_of`, antes de
-- cualquier otra cosa, que es lo que hace que el mensaje salga con el plan
-- nombrado y no en blanco.
--
-- El `detail` de la feature lleva `business=`, `plan=` y `feature=`, y NO lleva
-- `limit=`: el `detail` del tope describe un NÚMERO y éste describe una
-- FEATURE, y la API usa la presencia de `limit` para decidir si tiene que
-- dibujar un tope. Ponerlo ahí sería inventar un número que no existe.

-- ─── 1. LOS MIEMBROS ─────────────────────────────────────────────────────────

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
  -- Y desde `20261017033947` esto ya no es la puerta de atrás que era: el índice
  -- de un dueño por negocio cierra el otro lado de esa salida.
  if new.role = 'owner'::public.business_member_role then
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
  -- ESTA PREGUNTA va antes que la feature y antes que el tope porque es la que
  -- decide si la escritura CRECE. Las dos reglas del plan se preguntan lo
  -- mismo, y por eso comparten el mismo predicado.
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
  -- etiqueta, pausar, dar de baja, sellar la sesión. Eso es el §5.3, y antes
  -- de esta migración el trigger lo contradecía.
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

-- ─── 2. LAS SUCURSALES ──────────────────────────────────────────────────────

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