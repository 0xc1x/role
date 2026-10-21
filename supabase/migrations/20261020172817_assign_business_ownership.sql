-- ─────────────────────────────────────────────────────────────────────────────
-- La plataforma le devuelve el dueño a un negocio que se quedó sin él
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── LA REGLA, EN UNA FRASE ──────────────────────────────────────────────────
--
-- **Un negocio sin dueño vivo puede recibir uno, y sólo por la plataforma.**
--
-- Es la segunda mitad de D2: la liberación (Task 5) deja a un negocio inactivo
-- sin dueño, y esta función es la única puerta por la que vuelve a tener uno.
--
-- ─── POR QUÉ UNA SEGUNDA FUNCIÓN Y NO LA MISMA CON UN BANDERA ─────────────────
--
-- Porque son DOS hechos distintos y DOS permisos distintos:
--
--   - `transfer_business_ownership` exige que quien llama **sea** el dueño. Un
--     negocio sin dueño no tiene a nadie que lo sea, así que esa función no
--     puede servir para rescatarlo.
--   - `assign_business_ownership` la llama **la plataforma**, que no es miembro
--     de ningún negocio.
--
-- Una bandera en la misma función sería un interruptor para saltarse la
-- primera regla: la misma puerta, con un modo que dice «no te fijes quién
-- llama». Dos funciones son dos reglas que se leen por separado.
--
-- ─── POR QUÉ NO ES UNA PUERTA PARA SALTARSE EL INVARIANTE ────────────────────
--
-- Porque la función NO puede dejar el negocio con dos dueños ni con ninguno:
--
--   - Si el negocio YA tiene un dueño vivo, se niega con `R0004`. No hay
--     «asignar otro»: hay transferir, y la transferencia es la puerta del
--     dueño.
--   - Si no tiene dueño, promover a un acceso vivo deja EXACTAMENTE UNO, que
--     es lo que el índice parcial `business_members_one_owner_per_business`
--     admite y lo que el trigger diferido `trg_business_keeps_an_owner`
--     exige al commit.
--
-- Y el cerrojo (`for update` sobre la fila del negocio) es el mismo de la
-- Task 5: dos recuperaciones, o una recuperación y una transferencia, sobre el
-- mismo negocio tienen que verse en fila.
--
-- ─── POR QUÉ EL PERMISO DE PLATAFORMA LO COMPRUEBA LA API ────────────────────
--
-- Porque el permiso es de `app_role` —`profiles.role = 'admin'`— y la función
-- es ejecutable sólo por el servicio (`{postgres, service_role}`), que es la
-- API. El móvil no la puede abrir. Y la función deja la fila de
-- `business_ownership` coherente, que es lo que el móvil lee para saber de
-- quién es el negocio.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `assign_business_ownership`: LA RECUPERACIÓN
--
-- `volatile security definer set search_path = ''`, y el cuerpo QUALIFICADO
-- todo: con el `search_path` vacío, un nombre sin esquema no resuelve.
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

  -- 5. LA COHERENCIA CON `business_ownership`, mientras la tabla exista. Es un
  --    UPSERT y no un `update`: un negocio sin fila de propiedad es un negocio
  --    que el móvil no leía, y después de la recuperación tiene que leerse igual
  --    que los demás.
  --
  --    El `to_regclass` es porque `business_ownership` se retira en la Task 10.
  if to_regclass('public.business_ownership') is not null then
    insert into public.business_ownership (business_id, owner_id)
    values (p_business_id, v_member.user_id)
    on conflict (business_id)
    do update set owner_id = excluded.owner_id, updated_at = now();
  end if;

  -- 6. LA RESPUESTA: los tres identificadores, y nada más. No hay ningún
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