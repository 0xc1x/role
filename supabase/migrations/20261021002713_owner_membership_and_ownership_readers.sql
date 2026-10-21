-- ─────────────────────────────────────────────────────────────────────────────
-- El dueño pasa a ser una membresía, y las funciones dejan de mirar la tabla
-- vieja
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── POR QUÉ ESTE ARCHIVO EXISTE, Y POR QUÉ ES ANTERIOR AL `drop table` ─────
--
-- Porque la tabla vieja se va en la migración SIGUIENTE, y esta es la que deja
-- de escribirla. El orden importa por una razón concreta: `business_ownership`
-- es la fuente de verdad de las diecinueve policies viejas, y un trigger que
-- deja de escribirla mientras esas policies siguen en pie deja al dueño de un
-- negocio nuevo sin acceso por la capa vieja.
--
-- Por eso esta migración reescribe TODO lo que la tocaba, y nada más:
--
--   1. `bootstrap_business_companions` — el trigger del alta. Deja de escribir
--      la fila de propiedad y escribe la MEMBRESÍA DE DUEÑO, que es lo que el
--      móvil y el API leen.
--   2. `transfer_business_ownership` — deja de escribir la fila de propiedad.
--   3. `assign_business_ownership` — deja de escribir la fila de propiedad.
--   4. `release_business_ownership` — deja de borrar la fila de propiedad.
--   5. `enforce_owner_cannot_be_deleted` — la guarda que comparaba contra la fila
--      de propiedad se apaga: la verdad del dueño es la membresía.
--   6. `notify_business_pending` y `notify_business_verification` — el correo
--      del dueño se resuelve por la membresía.
--
-- ─── POR QUÉ LAS DOS ÚLTIMAS, QUE NO SON DE PROPIEDAD ───────────────────────
--
-- Porque son LECTORAS de la tabla vieja, y una función de plpgsql que la
-- nombra no falla al compilar: falla al EJECUTARSE, con
-- `relation "business_ownership" does not exist`. Es la forma más silenciosa
-- de romper producción que hay:
--
--   - `notify_business_pending` corre en el `AFTER INSERT` de `businesses`. Con
--     la tabla caída, TODOS los alta de negocio —del móvil y del API—
--     empezarían a fallar con un error de tabla que no existe.
--   - `notify_business_verification` corre en el `AFTER UPDATE` de
--     `business_moderation`: sin ella, ni la aprobación ni el rechazo de un
--     negocio funcionarían.
--
-- Ninguna de las dos está en el plan, y las dos son el tipo de cosa que un
-- `drop table` se come sin avisar.
--
-- ─── LO QUE NO CAMBIA, Y POR QUÉ ────────────────────────────────────────────
--
-- Los cuatro cuerpos de propiedad conservan:
--
--   - el ACL (`revoke all … from public, anon, authenticated` + `grant execute
--     … to service_role`), porque `create or replace` conserva el ACL y la
--     línea dice de quién es la puerta;
--   - `security definer` y `set search_path = ''`, con el cuerpo CALIFICADO
--     todo;
--   - los códigos de error (`R0004`) y sus mensajes, que son la prosa que el
--     dueño lee;
--   - el cerrojo: `select … for update` sobre la fila del negocio, AL PRINCIPIO
--     de cada función. Sin él, dos operaciones de propiedad sobre el mismo
--     negocio se leen el estado viejo y compiten por el índice parcial del
--     dueño con un `23505` —un error de índice, no una regla—. El cerrojo lo
--     puso `20261020174431` y esta migración lo copia tal cual.
--
-- ─── EL TRIGGER, Y POR QUÉ ES EL CAMBIO MÁS IMPORTANTE DEL ARCHIVO ─────────
--
-- El alta del MÓVIL inserta en `businesses` con el JWT del dueño y no puede
-- escribir la membresía: la RLS de `business_members` no tiene policy de
-- INSERT (`42501`). El trigger es el que le da dueño al negocio.
--
-- Antes escribía la fila de propiedad, que el móvil leía; ahora escribe la
-- membresía, que es la que el móvil lee (`getBusinessesByOwnerId` consulta
-- `business_members` con `role = 'owner'`).
--
-- La receta es la que verificó la Task 8, con una corrida de sonda dentro de
-- una transacción con `rollback`:
--
--   - `on conflict do nothing` SIN objetivo: `business_members` tiene tres
--     índices únicos (`id`, `(business_id, user_id)` y `(business_id,
--     lower(alias))`) y no se puede nombrar un objetivo que los cubra. Es el
--     mismo motivo por el que el alta del API usa `onConflictDoNothing()`: con
--     el trigger escribiendo la fila primero, el `on conflict` del API es lo
--     que evita el `23505`.
--   - `session_ttl_hours = 0`: un dueño no es una tablet compartida, y su
--     sesión no vence. Es lo mismo que dejó `20261016022631` en los 16 dueños
--     reales.
--   - `alias` = el correo del dueño (`auth.users.email`), como el backfill, con
--     un respaldo para el dueño sin correo: el alias es NOT NULL y único por
--     negocio.
--   - `enforce_business_member_limit` no muerde: sale antes que el plan y que
--     la feature cuando `new.role = 'owner'`, así que el tope de plan no
--     participa.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `bootstrap_business_companions`: EL DUEÑO ES UNA MEMBRESÍA
--
-- `volatile security definer set search_path = ''`, y el cuerpo CALIFICADO
-- todo. El ACL es el que tenía: `create or replace` lo conserva, y la línea
-- que lo dice se repite para que el archivo diga lo que la base dice.

create or replace function public.bootstrap_business_companions()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_owner uuid := (select auth.uid());
  v_email text;
begin
  -- 1. LA MEMBRESÍA DE DUEÑO. Sólo si hay llamador: el alta del API corre con
  --    el rol del pooler, donde `auth.uid()` es NULL, y esa API escribe la
  --    membresía ella misma en su propia transacción.
  if v_owner is not null then
    select u.email into v_email from auth.users u where u.id = v_owner;

    insert into public.business_members
      (business_id, user_id, role, label, alias, status, session_ttl_hours)
    values (new.id,
            v_owner,
            'owner'::public.business_member_role,
            new.name,
            coalesce(v_email, 'owner@' || coalesce(new.slug, 'negocio') || '.role.invalid'),
            'active'::public.business_member_status,
            0)
    on conflict do nothing;
  end if;

  -- 2. Y LOS DOS COMPANIONS DE SIEMPRE, que no cambian: la fila de dinero y
  --    la de moderación.
  insert into public.business_finance (business_id)
  values (new.id)
    on conflict (business_id) do nothing;

  insert into public.business_moderation (business_id)
  values (new.id)
    on conflict (business_id) do nothing;

  return new;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. `transfer_business_ownership`: LA MISMA OPERACIÓN, SIN LA TABLA VIEJA
--
-- El cuerpo es el de `20261020174431` —con su cerrojo, sus tres mitades de
-- dueño vivo, su alcance para el dueño saliente y sus cinco identificadores de
-- respuesta— menos el paso 7, que escribía la fila de propiedad.
--
-- El paso 7 se va porque la fila no existe más, y porque la coherencia que
-- sostenía —«el dueño nuevo ve el negocio y el viejo no»— la sostiene ahora la
-- membresía, que es lo que el móvil lee.

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
  v_business uuid;
  v_previous record;
  v_next     record;
begin
  -- 0. EL NEGOCIO, Y CON ÉL EL CERROJO. La fila se toma con `for update`:
  -- dos operaciones de propiedad sobre el mismo negocio tienen que verse en
  -- fila, y el cerrojo dura hasta el commit de esta transacción. Sin él, la
  -- segunda leería un estado viejo y competiría por el índice parcial del
-- dueño con un `23505` —un error de índice, no una regla—.
  select b.id into v_business
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
  --    fila dada de baja y una fila pausada son tres formas de la misma
  --    respuesta: no hay a quién transferirle.
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
  -- incompleto —que es un `manager` que no administra nada—.
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

  -- 7. LA RESPUESTA: los cinco identificadores, y nada más. No hay ningún
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
-- 3. `assign_business_ownership`: LA RECUPERACIÓN, SIN LA TABLA VIEJA
--
-- El cuerpo es el de `20261020172817` menos el paso 5, que escribía la fila de
-- propiedad. El cerrojo, el "este negocio ya tiene un dueño: usá la
-- transferencia" y el receptor vivo siguen igual.

create or replace function public.assign_business_ownership(
  p_business_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_business_id uuid;
  v_member      record;
begin
  -- 1. EL NEGOCIO, Y CON ÉL EL CERROJO. La fila se toma con `for update`:
  -- dos operaciones de propiedad sobre el mismo negocio tienen que verse en
  -- fila, y el cerrojo dura hasta el commit de esta transacción.
  select b.id into v_business_id
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

  -- 2. EL NEGOCIO YA TIENE DUEÑO: NO SE ASIGNA. Un segundo dueño no cabe —el
  --    índice parcial no lo deja— y la operación correcta es la transferencia,
  --    que es la puerta del dueño. Esta es la línea que impide que la
  --    recuperación sea una segunda forma de saltarse el invariante.
  if public.business_live_owner_count(p_business_id) > 0 then
    raise exception 'este negocio ya tiene un dueño: usá la transferencia'
      using
        errcode = 'R0004',
        detail = format('business=%s member=%s', p_business_id, p_member_id),
        hint = 'para cambiar de dueño está la transferencia: POST /businesses/:businessId/ownership/transfer';
  end if;

  -- 3. EL RECEPTOR: un acceso VIVO de ESE negocio. Un id de otro negocio, una
  --    fila dada de baja y una fila pausada son tres formas de la misma
  --    respuesta: no hay a quién darle el negocio.
  select m.id, m.user_id into v_member
    from public.business_members m
   where m.id = p_member_id
     and m.business_id = p_business_id
     and m.status = 'active'::public.business_member_status
     and m.deleted_at is null
   limit 1;

  if not found then
    raise exception 'el miembro tiene que ser un acceso vivo de este negocio'
      using
        errcode = 'R0004',
        detail = format('business=%s member=%s', p_business_id, p_member_id),
        hint = 'un acceso dado de baja, pausado o de otro negocio no puede recibir la propiedad';
  end if;

  -- 4. LA PROMOCIÓN. El dueño alcanza el negocio entero de forma implícita
  --    (D3), así que no hay filas de alcance que darle: no hacen falta para
  --    administrar, y un dueño con alcance es un dueño que se puede quedar
  --    sin él.
  --
  --    Y la promoción no choca con el tope de plan: `enforce_business_member_limit`
  --    sale antes de contar cuando la fila es de dueño, porque un dueño no
  --    consume cupo (§4.5).
  update public.business_members
     set role = 'owner'::public.business_member_role,
         updated_at = now()
   where id = v_member.id;

  -- 5. LA RESPUESTA: los tres identificadores, y nada más. No hay ningún
  --    dato de la persona en la respuesta.
  return jsonb_build_object(
    'business_id', p_business_id,
    'owner_member_id', v_member.id,
    'owner_user_id', v_member.user_id
  );
end;
$fn$;

revoke all on function public.assign_business_ownership(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.assign_business_ownership(uuid, uuid)
  to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. `release_business_ownership`: LA LIBERACIÓN, SIN LA TABLA VIEJA
--
-- El cuerpo es el de `20261020172601` menos el paso 6, que borraba la fila de
-- propiedad. El cerrojo, el "un negocio activo no libera a su dueño" y el
-- "sólo el dueño vivo" siguen igual.

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
  --    retirada de un negocio apagado; la de uno vivo es la transferencia, que
  --    degrada al dueño saliente y deja el negocio con alguien.
  if coalesce(v_active, false) then
    raise exception 'un negocio activo no libera a su dueño: transferí la propiedad'
      using
        errcode = 'R0004',
        detail = format('business=%s', p_business_id),
        hint = 'la propiedad de un negocio activo se transfiere con POST /businesses/:businessId/ownership/transfer';
  end if;

  -- 3. EL DUEÑO VIVO, Y QUE SEA EL ACTOR. Las tres mitades: `role = 'owner'`,
  --    `status = 'active'` y `deleted_at is null`. Un dueño archivado ya no es
  --    el dueño de nada, y un dueño de otro negocio no es el dueño de ÉSTE.
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
  --    es lógica, y el alias queda quemado porque el índice único no lleva
  --    predicado de `deleted_at`.
  update public.business_members
     set deleted_at = now(),
         updated_at = now()
   where id = v_member.id;

  -- 5. Y SU ALCANCE, CON ELLA. Una membresía archivada con su alcance vivo
  --    dice «esta persona llegaba a esta sucursal» de alguien que ya no está.
  update public.business_member_locations
     set deleted_at = now(),
         updated_at = now()
   where member_id = v_member.id
     and deleted_at is null;

  -- 6. LA RESPUESTA: los tres identificadores, y nada más. No hay ningún dato
  --    de la persona en la respuesta.
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
-- 5. `enforce_owner_cannot_be_deleted`: LA VERDAD DEL DUEÑO ES LA MEMBRESÍA
--
-- Se apaga la segunda guarda, la que comparaba contra la fila de propiedad.
-- Esa guarda protegía contra el huérfano silencioso —una fila de propiedad
-- nombrando a una persona que ya no está— y con la tabla retirada ese huérfano
-- no puede existir: el dueño de un negocio es su fila de `business_members`, y
-- una fila archivada es HISTORIA, no una propiedad que alguien conserve.
--
-- La guarda que QUEDA, y que es la que importa, es la primera: el dueño vivo
-- no se borra, se da de baja.

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

  return old;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. `notify_business_pending`: EL CORREO DEL DUEÑO, POR LA MEMBRESÍA
--
-- Corre en el `AFTER INSERT` de `businesses`: es decir, en TODOS los alta de
-- negocio. Con la tabla vieja caída, esta función reventaría con
-- `relation "business_ownership" does not exist` y el alta dejaría de existir
-- para todo el mundo.
--
-- La pregunta que hacía —«¿cuál es el correo del dueño de este negocio?»— la
-- contesta ahora la MEMBRESÍA DE DUEÑO VIVA, que es la misma definición que
-- usa `public.business_member_role`: `role = 'owner'`, `status = 'active'` y
-- `deleted_at is null`.
--
-- Y el `left join lateral` conserva la semántica del `left join` viejo: un
-- negocio SIN dueño vivo deja `owner_email` en NULL, que es lo que hacía la
-- fila de propiedad ausente.

create or replace function public.notify_business_pending()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  admin_template_id uuid;
  owner_template_id uuid;
  admin_email text;
  v_admin_url text;
  owner_email text;
  v_status text;
begin
  select verification_status into v_status
    from public.business_moderation where business_id = NEW.id;
  if v_status is not null and v_status <> 'pending' then
    return NEW;
  end if;
  -- solo en INSERT con pending
  if TG_OP = 'INSERT' then
    select id into admin_template_id from email_templates where name = 'business-pending-admin' and is_active and deleted_at is null limit 1;
    select id into owner_template_id from email_templates where name = 'business-pending-owner' and is_active and deleted_at is null limit 1;
    -- resolver emails
    select value #>> '{}' into admin_email from app_config where key = 'contact.negocios_email' and active and is_public;
    if admin_email is null or admin_email !~ '@' then admin_email := 'negocios@role.ec'; end if;
    -- The admin URL is configuration, not a literal. It used to be baked into
    -- this trigger body, which meant a domain change required editing a
    -- migration that had already run. Falls back to the previous literal so a
    -- missing key is never the reason an operator loses the deep link.
    select coalesce((select value #>> '{}' from public.app_config
                      where key = 'links.admin_url' and active),
                    'https://admin.role.app')
      into v_admin_url;
    -- EL CORREO DEL DUEÑO, POR LA MEMBRESÍA VIVA. La fila de propiedad se
    -- retiró; esta es la que queda, y la que el API y el móvil leen.
    select coalesce(NEW.email, u.email) into owner_email
      from public.business_members m
      join auth.users u on u.id = m.user_id
     where m.business_id = NEW.id
       and m.role = 'owner'::public.business_member_role
       and m.status = 'active'::public.business_member_status
       and m.deleted_at is null;

    if admin_template_id is not null then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.id, admin_template_id, admin_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', NEW.name, 'businessType', NEW.type, 'ownerEmail', owner_email, 'phone', coalesce(NEW.phone,''), 'description', coalesce(NEW.description,''), 'adminUrl', v_admin_url || '/businesses/' || NEW.id::text));
    end if;
    if owner_template_id is not null and owner_email ~ '@' then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.id, owner_template_id, owner_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', NEW.name));
    end if;
  end if;
  return NEW;
end;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. `notify_business_verification`: IDEM, PARA LA APROBACIÓN Y EL RECHAZO
--
-- Corre en el `AFTER UPDATE OF verification_status` de `business_moderation`:
-- sin ella, ni la aprobación ni el rechazo de un negocio funcionarían.
--
-- El `left join lateral` conserva la semántica del `left join` viejo: sin
-- dueño vivo, `owner_email` es el correo DEL NEGOCIO o NULL, que es lo que
-- pasaba cuando la fila de propiedad no estaba.

create or replace function public.notify_business_verification()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $fn$
declare
  tmpl_id uuid;
  owner_email text;
  v_name text;
begin
  if OLD.verification_status = NEW.verification_status then
    return NEW;
  end if;

  select b.name, coalesce(b.email, u.email) into v_name, owner_email
    from public.businesses b
    left join lateral (
      select au.email
        from public.business_members m
        join auth.users au on au.id = m.user_id
       where m.business_id = b.id
         and m.role = 'owner'::public.business_member_role
         and m.status = 'active'::public.business_member_status
         and m.deleted_at is null
       order by m.updated_at desc
       limit 1
    ) u on true
   where b.id = NEW.business_id;

  if NEW.verification_status = 'approved' then
    select id into tmpl_id from email_templates where name = 'business-approved' and is_active and deleted_at is null limit 1;
    if tmpl_id is not null and owner_email ~ '@' then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.business_id, tmpl_id, owner_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', v_name, 'appUrl', 'role://'));
    end if;
  elsif NEW.verification_status = 'rejected' then
    select id into tmpl_id from email_templates where name = 'business-rejected' and is_active and deleted_at is null limit 1;
    if tmpl_id is not null and owner_email ~ '@' then
      insert into email_sends (type, source_type, source_id, template_id, email, status, scheduled_at, queued_at, attempts, max_attempts, variables_used)
      values ('transactional','business', NEW.business_id, tmpl_id, owner_email, 'pending', now(), now(), 0, 5, jsonb_build_object('businessName', v_name, 'rejectionReason', coalesce(NEW.rejection_reason,'No especificado')));
    end if;
  end if;
  return NEW;
end;
$fn$;
