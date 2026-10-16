-- ─────────────────────────────────────────────────────────────────────────────
-- Los topes contaban al revés, y el mensaje decía «sucursals»
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── POR QUÉ UNA MIGRACIÓN NUEVA Y NO UNA EDICIÓN ────────────────────────────
--
-- Esto SUPERSEDE a `20261015034230_plan_limit_guards.sql`. Ese archivo está
-- sellado: su `md5sum` es `556416b2b4baa383e6452a0c64fe9295` y ese es el
-- `md5(statements[1])` de su fila del ledger. Editarlo haría que el directorio
-- dejara de describir la base —el único modo de fallo que el README existe para
-- impedir— y borraría la prueba de qué cuerpo estaba vivo cuando se aplicó. La
-- supersesión ya es el camino del repo: `20261015001857_staff_permission_helpers`
-- fue superado por `…03929_business_member_permission_hardening` y por
-- `…12253_business_member_session_disabled_reason`, tres archivos y un estado
-- final.
--
-- ─── DEFECTO 1: UN `label` RENOMBRADO CONTABA COMO CRECIMIENTO ───────────────
--
-- La primera versión decidía si una escritura de `business_members` «agrega»
-- una fila al conteo así:
--
--     v_agrega := new.deleted_at is null
--                and (old.role is distinct from 'owner'     <-- al revés
--                     or old.deleted_at is not null
--                     or old.business_id is distinct from new.business_id);
--
-- `is distinct from` está invertido. `old.role is distinct from 'owner'` es
-- VERDADERO justamente cuando la fila YA contaba —un `staff`— y FALSO cuando
-- no contaba, que es el único caso en el que la escritura suma algo. Medido
-- contra la primera versión: un negocio grandfathered con tres accesos bajo
-- `free`, cuyo tope es dos, no podía cambiar ni una etiqueta.
--
--     ERROR: el plan free admite hasta 2 miembros, no más   (P0001)
--
-- Es la misma promesa rota que el §5.4 descarta para las sucursales, del lado de
-- los miembros: el tope frenó una escritura que no era crecimiento. Y no la frenó
-- por poco ni con un mensaje raro —frenó con el texto correcto del tope—, que es
-- la parte peor: un dueño que edita el nombre de un empleado y lee «tu plan no
-- admite más miembros» no tiene por dónde sospechar que el mensaje es verdad y
-- que lo que está mal es la pregunta que se le hizo al motor.
--
-- La condición correcta es la NEGACIÓN de «la fila ya contaba», y por eso el
-- operador es `old.role = 'owner'`, no su negación:
--
--     new.deleted_at is null
--     and (old.role = 'owner'                              -- antes no contaba por su rol
--          or old.deleted_at is not null                   -- antes estaba dada de baja
--          or old.business_id is distinct from new.business_id)  -- antes era de otro negocio
--
-- Y `status` sigue sin entrar ni en el conteo ni en `v_agrega`: un acceso
-- PAUSADO sigue ocupando su plaza (es lo que dice el §4.5, y la lista de la
-- UI cuenta los mismos que el motor), así que pausar no es crecer y no puede
-- rebotar. Dar de baja sí es siempre más fácil que crecer: por eso
-- `new.deleted_at is null` está FUERA del `or`, y no dentro.
--
-- ─── DEFECTO 2: `%s` NO ES UN ESPECIFICADOR DE FORMATO ────────────────────────
--
-- plpgsql no tiene `%s`. El marcador es `%`, y `%s` es un `%` seguido de una
-- `s` literal. El mensaje llevaba el sustantivo como tercer argumento esperando
-- un formateo que no existe, así que lo que leía el dueño al que se le frenaba
-- el crecimiento —el texto que la UI le enseña para decirle qué pasó, según el
-- §5.3— era:
--
--     el plan free admite hasta 1 sucursals, no más
--     el plan pro admite hasta 5 sucursaless, no más
--
-- Seis de los tests del bloque lo cazaron. El motor de topes funcionaba; el
-- mensaje no, y el mensaje es la mitad del contrato de esta migración. La
-- corrección es un tercer `%` con el sustantivo ya decidido, que es lo que el
-- `case` del singular/plural ya hacía bien: sólo estaba pegado al marcador.
--
-- ─── UNA COSA QUE NO ESTABA, Y QUE SÍ SE CIERRA ─────────────────────────────
--
-- `business_has_feature` —en el mismo archivo— tiene su `else false` y su
-- comentario diciendo que es para que un plan nuevo no conceda features antes de
-- que nadie decidiera cuánto cuesta cada una. Los dos `case` de topes no tenían
-- esa red: `else null` es indistinguible de «sin tope», así que agregar un tier
-- al enum lo habría regalado sin límite y sin que nadie lo notara. Hoy no
-- cambia nada —el enum tiene tres valores y los tres están nombrados— pero la
-- diferencia entre «pro_plus no tiene tope» y «nadie describió este plan» es
-- exactamente la que un `else` ruidoso vuelve visible.
--
-- La forma del `case` es la del §4.5, con los tres planes nombrados uno por
-- uno. El guard de catálogo que lo ata está en
-- `apps/api/src/database/security/business-members.rls.db.spec.ts`.
--
-- ─── LO QUE NO CAMBIA ───────────────────────────────────────────────────────
--
-- La asimetría del §5.4 se mantiene intacta: `business_members` sale antes de
-- contar cuando `NEW.role = 'owner'`, y `business_locations` NO tiene esa
-- salida —una sucursal nueva consume cupo la cree quien la cree, y lo que
-- decide QUIÉN puede crearla es la policy del §6.2, que aplica el API en el
-- Plan 2. Esta migración no le agrega un chequeo de rol que el diseño deja
-- deliberadamente en otro sitio.
--
-- `v_otros` sigue excluyendo la fila que esta escritura está tocando
-- (`id <> new.id`): en un `UPDATE` la fila sigue en la tabla con sus valores
-- viejos, y contarla sería contarla dos veces. Renombrar una sucursal de un
-- negocio por encima del tope sigue pasando, insertar una cuarta sigue
-- rebotando, y reabrir una cerrada con el tope encima también.
--
-- No se recrean los triggers: `create or replace function` conserva el OID, y
-- los dos triggers de `20261015034230` apuntan a estos mismos nombres. Un
-- `drop trigger` + `create trigger` aquí sólo añadiría ruido al ledger.
--
-- Y ningún `grant` ni `revoke`: el ACL de cada función lo conserva el
-- `create or replace` por su cuenta.

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
    raise exception 'el plan % admite hasta % %', v_plan, v_limit,
      case when v_limit = 1 then 'sucursal' else 'sucursales' end;
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

  if v_despues > v_otros and v_despues > v_limit then
    raise exception 'el plan % admite hasta % miembros, no más', v_plan, v_limit;
  end if;

  return new;
end;
$fn$;