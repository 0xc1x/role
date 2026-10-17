-- ─────────────────────────────────────────────────────────────────────────────
-- Al dueño tampoco se lo borra, y la guarda mira la transición
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- Esto SUPERSEDE a `20261017033947_owner_is_untouchable`, que está sellado: su
-- `md5sum` es `41a16c7fbcbd973f4990dc614b4f6a95` y ese es el `md5(statements[1])`
-- de su fila del ledger. Dos archivos y un estado final, que es el camino del
-- repo para esto.
--
-- ─── EL BORRADO FÍSICO NO LO MIRABA NADIE ────────────────────────────────────
--
-- `20261017033947` colgó un `trg_enforce_owner_is_untouchable` `BEFORE UPDATE` y
-- nada más. Un `delete from public.business_members where role = 'owner'` pasaba
-- limpio: sin error, sin `R0002`, y el negocio se quedaba sin dueño con la misma
-- fila que el índice parcial protege —o sea, protegido y borrado en el mismo
-- statement.
--
-- Lo que frenaba era RLS, y no alcanza: las dos policies de la tabla son de
-- SELECT, así que a `anon` y a `authenticated` los frena, y a `service_role` y a
-- `postgres` no. Y `service_role` es exactamente lo que el `POST /staff` y el
-- `PATCH /staff/:memberId` del Plan 2 van a usar para escribir en esta tabla.
--
-- ─── POR QUÉ ES UN BUG DE LA API Y NO UNA FUNCIÓN ─────────────────────────────
--
-- El §8 dice que el borrado es LÓGICO porque la fila vale cuando alguien se va:
-- «el conteo de quién estuvo aquí sigue siendo posible y el borrado físico queda
-- como operación separada, no expuesta en la v1». Un `DELETE` físico no es una
-- operación más, es la que borra la prueba: se lleva la fila, y con ella por
-- cascade las filas de `business_member_locations` que dicen a qué sucursal
-- pertenecía esa persona. Lo que queda es un negocio con una lista de empleados
-- de la que no se puede reconstruir quién estuvo.
--
-- Y hay un segundo camino, que no es la API: `business_members.user_id` referencia
-- a `profiles(id) on delete cascade` y `business_id` a `businesses(id) on delete
-- cascade`. Borrar el `auth.users` de un dueño borra su perfil y con él su fila de
-- miembro. Ese `DELETE` no lo escribe nadie a propósito, y por eso la guarda se
-- pone por FILA y no por camino.
--
-- ─── LA GUARDA ES POR EL DUEÑO VIVO, Y ESO ES DELIBERADO ─────────────────────
--
-- `old.role = 'owner' and old.deleted_at is null`. Una fila de dueño YA dada de
-- baja sí se puede borrar: es historia, y el §8 la quiere, y un "purga de
-- historial" futuro tiene que poder decir «lo que borro es historia» en vez de
-- encontrarse con un trigger que no lo distingue de quitarle el dueño a un
-- negocio que está operando.
--
-- Y la salida de la guarda es la misma que la del resto del trigger, y es
-- deliberada: degradar la fila primero. Después de degradada no es el dueño, así
-- que el `DELETE` pasa —igual que un `delete` de cualquier otra fila—, y el
-- negocio ya no tiene dueño porque alguien lo degradó a propósito, que es distinto
-- de porque alguien borró la fila sin querer.
--
-- ─── POR QUÉ UNA FUNCIÓN HERMANA Y NO UNA ─────────────────────────────────────
--
-- Porque la regla de acá y la de `20261017033947` no se parecen en nada: aquella
-- compara `old` con `new` sobre una fila viva, y ésta lee una sola fila que ya no
-- va a existir. Meterlas en un mismo cuerpo exigiría una rama de `tg_op` al
-- principio, y una función cuya mitad de las líneas son «si estamos en el otro
-- camino, salí». Dos guardas, dos funciones, dos triggers: cada una se lee entera
-- y se cambia sin tocar la otra.
--
-- ─── LA GUARDA DE `status` MIRABA EL ESTADO, NO LA TRANSICIÓN ─────────────────
--
-- `20261017033947` escribía `if new.status = 'disabled'`, y ocho líneas más abajo
-- escribía `if old.deleted_at is null and new.deleted_at is not null`. La segunda
-- es una transición y la primera es un estado, y en una fila que LLEGÓ en
-- `disabled` la diferencia es visible: como el trigger es `BEFORE UPDATE` y no
-- ve el alta, una fila de dueño puede nacer desactivada —y nace, si alguien la
-- inserta así—, y a partir de ahí cualquier escritura que la deje en `disabled`
-- dispara la guarda de desactivar.
--
-- Lo que se veía en la práctica era que el operador recibía la regla equivocada:
-- un `set deleted_at` sobre esa fila decía «el dueño no se puede desactivar» y
-- paraba antes de llegar a la guarda de la baja, que es la que correspondía; y un
-- `set label = 'x'` —que no desactiva nada— decía lo mismo.
--
-- `old.status is distinct from new.status and new.status = 'disabled'` deja las dos
-- guardas mirando la misma cosa: una transición. `status` es `NOT NULL`, así que no
-- hay un agujero de predicado nulo en ninguna de las dos; era estado contra
-- transición y nada más.
--
-- Lo que NO cambia con esto: `set status = 'active'` sobre un dueño desactivado
-- sigue entrando, así que la fila no queda enclavada, y la escritura combinada que
-- sí queda es la que cambia de fila: degradar, reactivar y dar de baja a la vez.
-- Las dos guardas siguen cerrando las dos salidas.
--
-- ─── LO QUE NO CAMBIA ────────────────────────────────────────────────────────
--
-- El índice parcial de `20261017033947` no se toca. La degradación sigue pasando.
-- `manager` y `staff` se siguen pudiendo desactivar y dar de baja, y borrar: un
-- trigger que negara la fila entera rompería la revocación de la §8, que es el
-- control de seguridad de verdad de esta tabla. Los dos triggers de topes tampoco.

-- ─── 1. LA GUARDA DE `status`, QUE ERA UN ESTADO Y NO UNA TRANSICIÓN ──────────

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
  --
  -- Las dos guardas miran una TRANSICIÓN, y no sólo una: `20261017033947` comparaba
  -- el estado de destino contra 'disabled' y, en una fila que ya había nacido así,
  -- disparaba en cualquier escritura. La guarda de la baja, ocho líneas más abajo,
  -- ya miraba las dos mitades; ésta se le parece ahora.
  if old.status is distinct from new.status
     and new.status = 'disabled'::public.business_member_status then
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

-- ─── 2. Y EL BORRADO FÍSICO, QUE NO LO MIRABA NADIE ───────────────────────────

create or replace function public.enforce_owner_cannot_be_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- Sólo la fila del dueño VIVO. Una fila que ya estaba dada de baja es historia
  -- y se puede borrar; la de un `manager` o un `staff` no es el dueño de nada y se
  -- puede borrar como cualquier otra. Sin este `return` una fila de ésas —o una
  -- de dueño ya archivada— quedaría con la fila borrada y sin aviso, que es peor
  -- que no tener guarda.
  if old.role <> 'owner'::public.business_member_role
     or old.deleted_at is not null then
    return old;
  end if;

  raise exception 'el dueño del negocio no se puede borrar; dá de baja la fila en vez de borrarla'
    using
      errcode = 'R0002',
      detail = format('business=%s member=%s', old.business_id, old.id),
      hint = 'el borrado es lógico: la fila queda para saber quién operó en el negocio';
end;
$fn$;

drop trigger if exists trg_enforce_owner_cannot_be_deleted on public.business_members;
create trigger trg_enforce_owner_cannot_be_deleted
  before delete on public.business_members
  for each row execute function public.enforce_owner_cannot_be_deleted();

-- La función del borrado es de trigger y de interno, como las otras dos. Y el
-- `revoke` se escribe aunque `pg_default_acl` ya dé `{postgres, service_role}`:
-- es lo que hace que el default deje de importar, y la razón está escrita en el
-- archivo de `20261017033947`.
revoke all on function public.enforce_owner_cannot_be_deleted() from public, anon, authenticated;