-- ─────────────────────────────────────────────────────────────────────────────
-- La transferencia de propiedad, y el cerrojo que le faltaba
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── POR QUÉ ESTE ARCHIVO EXISTE ──────────────────────────────────────────────
--
-- Porque `20261020163244_ownership_transfer.sql` creó la transferencia SIN
-- cerrojo, y la concurrencia la encontró: dos transferencias del mismo negocio
-- que corren a la vez leen el mismo estado, y la segunda compite con la primera
-- por el índice parcial `business_members_one_owner_per_business`. El
-- invariante no se rompía —el índice y el trigger diferido lo sostienen— pero
-- el segundo que llegaba se enteraba con un `23505` de índice, que es un
-- error de almacenamiento y no una regla de negocio.
--
-- Y peor: la liberación (Task 5) y la transferencia se cruzaban sin
-- cruzarse de manos. La liberación borra la fila de `business_ownership` en la
-- misma transacción que archiva la membresía del dueño; si la transferencia
-- se metía en el medio, podía dejar un negocio CON dueño vivo y SIN fila de
-- propiedad —el huérfano silencioso otra vez, por el otro lado—.
--
-- ─── EL CERROJO ───────────────────────────────────────────────────────────────
--
-- `select … for update` sobre la fila del negocio, AL PRINCIPIO de la función.
-- Es el mismo cerrojo que usan la liberación y la recuperación, y por el mismo
-- motivo: las operaciones de propiedad sobre un negocio tienen que verse en
-- fila. Cada una de las tres toma el mismo cerrojo y ninguna toma dos, así que
-- no hay deadlock posible.
--
-- Con el cerrojo, la segunda transferencia espera a que la primera confirme,
-- ve el estado final —el dueño viejo ya es gerente— y se niega con `R0004` y
-- con el motivo que corresponde. Y la liberación que llega después de una
-- transferencia se niega por lo mismo, en vez de dejar el huérfano.
--
-- ─── LO QUE NO CAMBIA ─────────────────────────────────────────────────────────
--
-- El cuerpo de la función es el de `20261020163244`, con UN paso más al
-- principio. El mismo nombre, la misma firma, el mismo ACL, los mismos
-- mensajes y el mismo `jsonb` de respuesta: lo que se agrega es el cerrojo.
-- La función sigue siendo `volatile security definer set search_path = ''`, y
-- el `revoke`/`grant` explícito se repite aunque `create or replace` conserva
-- el ACL: la línea es la que dice de quién es la puerta, y lo que se leyó en
-- la base tiene que decir lo mismo que el archivo.
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