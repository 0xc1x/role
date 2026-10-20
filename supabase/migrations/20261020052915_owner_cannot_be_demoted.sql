-- ─────────────────────────────────────────────────────────────────────────────
-- El dueño no se degrada: sin transferencia, degradarlo deja al negocio sin dueño
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- Esto SUPERSEDE a `20261017040808_owner_cannot_be_deleted`, que está sellado: su
-- `md5sum` es `85c157cf201cce6c6ee258e0378a6944` y ese es el `md5(statements[1])`
-- de su fila del ledger. Dos archivos y un estado final, que es el camino del
-- repo para esto.
--
-- ─── QUÉ CAMBIA Y POR QUÉ ─────────────────────────────────────────────────────
--
-- `20261017033947` dejó pasar la DEGRADACIÓN a propósito: «ningún rol puede
-- desactivar al dueño» (§5.4) no dice «y nadie puede dejar de serlo», y la
-- transferencia de propiedad iba a necesitar exactamente esa salida.
--
-- La transferencia no existe. El §5.4 la deja fuera de la v1, y mientras tanto
-- la degradación es una puerta que se cierra con una línea de HTTP:
-- `PATCH /businesses/:id/staff/:memberId {"role":"manager"}` sobre la fila del
-- PROPIO dueño, un id que el dueño se lee a sí mismo en `GET /staff`.
--
-- Lo que queda después es un negocio inmanejable e invisible: las puertas
-- owner-only niegan a todos —incluido al degradado—, `listForUser` borra el
-- negocio del listado del panel, y ninguna ruta puede devolver `role: 'owner'`
-- porque la promoción es un 422 desde el §5.4. No hay vuelta atrás.
--
-- Así que degradar se NIEGA, y se niega con el código que YA EXISTÍA: `R0002`,
-- el dueño intocable. No es un código nuevo porque no es una regla nueva: es la
-- misma invariante —«el dueño del negocio no se toca»— con una tercera salida
-- que estaba tapada.
--
-- ─── LO QUE NO SE TOCA ────────────────────────────────────────────────────────
--
-- El `INSERT` no lo ve —el trigger es `BEFORE UPDATE`—, así que el backfill del
-- Plan 1 y cualquier recarga de la tabla quedan intactos.
--
-- Una escritura que deja `role = 'owner'` como estaba sigue pasando: el sello
-- de la sesión, el TTL, la etiqueta, el alias, `updated_at`. La guarda mira la
-- TRANSICIÓN del rol —`new.role` contra `old.role`—, no el estado de la fila, y
-- por eso una fila de dueño que ya está en `disabled` no se queda enclavada.
--
-- Y una fila que NO es la del dueño sale por el primer `return`: la pausa y la
-- baja de un empleado que se va (§8) siguen siendo libres, que es la revocación
-- de verdad de esta tabla. Un trigger que negara la fila entera dejaría al
-- negocio sin poder despedir a nadie.
--
-- ─── LOS MENSAJES QUE APUNTABAN A UNA PUERTA QUE DESDE AQUÍ NO EXISTE ─────────
--
-- «degradalo a manager primero» era la salida de la guarda de desactivar, y
-- «degradalo primero» —con su pista «bajale el rol antes de darlo de baja»— la
-- de la guarda de dar de baja. Desde esta migración esa salida está cerrada, y
-- un mensaje que manda al operador a una puerta que rebota es peor que un
-- mensaje que no da ninguna: el operador lee «desactivar», toca «desactivar» y
-- recibe «no se puede degradar», sin ninguna explicación en el medio.
--
-- Los dos textos cambian y los dos siguen siendo `R0002`, con el mismo `detail`
-- y la misma forma. Lo que cambia es a dónde mandan: a la razón de verdad, que
-- es que la transferencia de propiedad no está en esta versión.

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

  -- LA DEGRADACIÓN SE NIEGA. La transferencia de propiedad no existe en esta
  -- versión (§5.4), y degradar al único dueño deja al negocio sin nadie que lo
  -- administre, invisible en el listado del panel y sin ninguna operación que
  -- lo revierta. El código es el de siempre —`R0002`, el dueño intocable—
  -- porque es la misma invariante con una tercera salida tapada.
  if new.role <> 'owner'::public.business_member_role then
    raise exception 'el dueño del negocio no se puede degradar; la transferencia de propiedad no existe en esta versión'
      using
        errcode = 'R0002',
        detail = format('business=%s member=%s', new.business_id, old.id),
        hint = 'la transferencia de propiedad no está en la v1: degradar al dueño dejaría el negocio sin dueño';
  end if;

  -- A partir de acá la fila SIGUE siendo la del dueño, y hay dos salidas que se
  -- niegan: desactivar y dar de baja. Las dos dejan al negocio sin nadie que lo
  -- administre, que es el «nadie se queda fuera de su negocio» del §5.4.
  --
  -- Las dos guardas miran una TRANSICIÓN, y no sólo una: `20261017033947` comparaba
  -- el estado de destino contra 'disabled' y, en una fila que ya había nacido así,
  -- disparaba en cualquier escritura. La guarda de la baja, ocho líneas más abajo,
  -- ya miraba las dos mitades; ésta se le parece ahora.
  if old.status is distinct from new.status
     and new.status = 'disabled'::public.business_member_status then
    raise exception 'el dueño del negocio no se puede desactivar; la transferencia de propiedad no existe en esta versión'
      using
        errcode = 'R0002',
        detail = format('business=%s member=%s', new.business_id, old.id),
        hint = 'ningún rol desactiva al dueño; la transferencia de propiedad no está en la v1';
  end if;

  if old.deleted_at is null and new.deleted_at is not null then
    raise exception 'el dueño del negocio no se puede dar de baja; la transferencia de propiedad no existe en esta versión'
      using
        errcode = 'R0002',
        detail = format('business=%s member=%s', new.business_id, old.id),
        hint = 'el borrado es lógico: la fila queda para saber quién operó en el negocio';
  end if;

  return new;
end;
$fn$;

-- El trigger no se toca: `trg_enforce_owner_is_untouchable` sigue apuntando a
-- este mismo nombre de función, y el `create or replace` conserva el OID y el
-- ACL. Lo que cambia es el cuerpo, y el cuerpo es el de esta migración.
--
-- El `revoke` se escribe aunque `pg_default_acl` ya dé `{postgres, service_role}`:
-- es lo que hace que el default deje de importar, y la razón está escrita en el
-- archivo de `20261017033947`.
revoke all on function public.enforce_owner_is_untouchable() from public, anon, authenticated;