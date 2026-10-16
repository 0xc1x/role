-- ─────────────────────────────────────────────────────────────────────────────
-- El mensaje de sucursales perdió su «, no más»
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── EL DEFECTO ──────────────────────────────────────────────────────────────
--
-- `20261016000829_plan_limit_guard_counting_and_message.sql` corrigió el
-- marcador `%s` del mensaje de sucursales —que en plpgsql no existe— y al
-- reescribir la línea se comió el cierre. Su `raise` quedó así:
--
--     raise exception 'el plan % admite hasta % %', v_plan, v_limit,
--       case when v_limit = 1 then 'sucursal' else 'sucursales' end;
--
-- y el texto que llega a la UI quedó en «el plan free admite hasta 1 sucursal».
-- El plan, el número y el plural son los correctos; lo que falta es el
-- «, no más» que le dice a la persona que el motivo del rechazo es el tope y
-- no una falta. Sin él, «el plan free admite hasta 1 sucursal» se lee como una
-- descripción del plan.
--
-- El defecto es de esta migración y de la anterior, no de `20261015034230`: el
-- texto original sí traía el cierre y las dos correcciones lo perdieron. Queda
-- escrito aquí para que la cadena se lea en orden en vez de por el archivo
-- sellado más reciente, que es el único que un lector abriría primero.
--
-- ─── POR QUÉ UNA MIGRACIÓN NUEVA ─────────────────────────────────────────────
--
-- El archivo anterior está sellado: su `md5sum` es el `md5(statements[1])` de su
-- fila del ledger, y editarlo haría que el directorio dejara de describir la
-- base. Es el mismo motivo por el que `20261015034230` no se editó para arreglar
-- su `v_agrega`.
--
-- ─── LO QUE ESTA MIGRACIÓN NO TOCA ──────────────────────────────────────────
--
-- `enforce_business_member_limit` no se recrea. Su mensaje nunca tuvo el fallo
-- —«el plan % admite hasta % miembros, no más»— y la supersesión anterior ya lo
-- dejó como debe ser; volver a declararlo aquí convertiría una corrección de
-- una línea en una segunda copia de un cuerpo que no cambió, que es como estas
-- cadenas empiezan a divergir sin que nadie lo decida.
--
-- Tampoco se recrean los triggers, y no hay ningún `grant` ni `revoke`: los
-- triggers de `20261015034230` siguen apuntando a estos nombres y el
-- `create or replace` conserva el OID y el ACL.
--
-- La única diferencia entre el cuerpo de abajo y el de `…00829` es la línea del
-- `raise`. Todo lo demás —el plan resuelto antes de la comprobación, el conteo
-- que excluye la fila que la escritura está tocando, el `v_agrega` que sólo
-- cuenta lo que esta escritura agrega y el `else` ruidoso del `case`— es el
-- mismo cuerpo, y por eso la migración es corta y no porque el trabajo lo fuera.

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
      case when v_limit = 1 then 'sucursal' else 'sucursales' end;
  end if;

  return new;
end;
$fn$;