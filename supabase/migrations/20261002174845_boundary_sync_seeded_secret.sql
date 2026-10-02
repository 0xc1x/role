-- El secreto sembrado a mano nunca llega a las Edge functions en un entorno nuevo.
--
-- Aplica con `apply_migration` (NO `execute_sql`, NO el dashboard). El ledger
-- `supabase_migrations.schema_migrations` es la única prueba de lo que corrió; un
-- DDL aplicado por la puerta de atrás deja un entorno que `supabase db push`
-- reproduce distinto de lo que pasó. Tras aplicar, renombrar este archivo a la
-- versión que asignó el servidor y confirmar que
-- `md5sum <archivo> == md5(statements[1])` de la fila del ledger.
-- Procedimiento: supabase/migrations/README.md.
--
-- ─── QUÉ CORRIGE ──────────────────────────────────────────────────────────
--
-- `20260925163235` sincroniza el secreto interno hacia las Edge functions dentro
-- de un bloque `do $$` que arranca así:
--
--   if legacy_src is null then
--     if not exists (... internal_secret ...) or not exists (... supabase_url ...)
--        or not exists (... supabase_anon_key ...) then
--       raise exception 'Vault is missing required secrets and no legacy
--         handle_order_event_push source exists. Seed Vault, then re-run.';
--     end if;
--     return;          <── ACÁ ESTÁ EL HUECO
--   end if;
--
-- `legacy_src` es el cuerpo de la función `handle_order_event_push`, y existe
-- únicamente en un proyecto que ya tenía esa función antes de que esta
-- migración la reemplazara. En un entorno NUEVO `legacy_src` es null desde el
-- principio: ese es justamente el caso que el propio `raise` pide sembrar a mano
-- ("Seed Vault, then re-run"). O sea que el bloque hace lo correcto —validar que
-- Vault tenga lo suyo— y después sale antes de sincronizar.
--
-- El efecto: un operador que siembra `internal_secret` en Vault y replayea las
-- migraciones termina con las cinco Edge functions sin su `INTERNAL_SECRET`. Y
-- como las funciones son `verify_jwt:false`, el gateway reenvía igual y cada
-- dispatch falla 401. Eso se lee como "el secreto no se inyectó" y manda a
-- investigar al subsistema equivocado — el mismo modo de fallo del dispatcher que
-- `20260925175051` arregló, con el mismo síntoma y otra causa.
--
-- ─── POR QUÉ UNA MIGRACIÓN NUEVA Y NO EDITAR LA ANTERIOR ───────────────────
--
-- `20260925163235` ya corrió, y su md5 es la única prueba de lo que pasó. Editarla
-- rompería esa prueba y haría que `supabase db push` reprodujese un archivo que
-- la base nunca ejecutó. Además, en un entorno que YA tiene los secretos
-- sincronizados, corregir la función antigua no arreglaría el estado: hay que
-- ejecutar la sincronización igual.
--
-- ─── QUÉ HACE ESTA ──────────────────────────────────────────────────────────
--
-- El bloque de abajo repite la sincronización para las cinco funciones, sin
-- mirar `legacy_src`: si `internal_secret` está en Vault, se empuja. Es
-- idempotente por construcción —`update_secret` cuando la entrada ya existe,
-- `create_secret` cuando no— y no lee ningún secreto del código: sale de
-- `vault.decrypted_secrets`.
--
-- El `raise` es deliberado y es lo que hace el bloque seguro de verdad: si
-- `internal_secret` no está en Vault, esta migración PARA en vez de sincronizar
-- un NULL. Un fallo ruidoso acá es mejor que cinco Edge functions que devuelven
-- 401 sin explicación.
--
-- `slugs` es la lista que la función `invoke_internal_edge_function` acepta como
-- allowlist, leída del propio SQL del ledger y no de una copia: si esa lista
-- cambia, el `raise` de abajo la detecta en vez de dejar funciones sin sincronizar.

begin;

do $$
declare
  v_secret text;
  v_slug text;
  slugs text[] := array[
    'handle-order-event',
    'handle-pickup-reminders',
    'handle-weekly-summary',
    'dispatch-nearby-offers',
    'handle-offer-created'
  ];
  -- La allowlist de `invoke_internal_edge_function` tiene que seguir siendo esta.
  -- Si alguien la cambia y no actualiza esta migración, el error sale acá y no
  -- como cinco funciones sin secreto.
  v_allowlist text;
begin
  select pg_get_functiondef(p.oid) into v_allowlist
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'invoke_internal_edge_function';

  if v_allowlist is null then
    raise exception
      'sync_seeded_secret: public.invoke_internal_edge_function is missing, so the sync has no allowlist to match';
  end if;

  foreach v_slug in array slugs loop
    if v_allowlist not like ('%''' || v_slug || '''%') then
      raise exception
        'sync_seeded_secret: % is not in the invoke_internal_edge_function allowlist; update this migration rather than syncing a function that can never be dispatched',
        v_slug;
    end if;
  end loop;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'internal_secret';

  if v_secret is null then
    raise exception
      'internal_secret is not in Vault. Seed it, then re-run: without it every Edge dispatch is a 401 and nothing says why.';
  end if;

  foreach v_slug in array slugs loop
    if exists (
      select 1 from vault.secrets
      where name = 'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET'
    ) then
      perform vault.update_secret(
        (select id from vault.secrets
          where name = 'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET'),
        v_secret,
        'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET',
        'INTERNAL_SECRET for ' || v_slug || ', synced by migration.'
      );
    else
      perform vault.create_secret(
        v_secret,
        'supabase_functions_secret_' || v_slug || '_INTERNAL_SECRET',
        'INTERNAL_SECRET for ' || v_slug || ', synced by migration.'
      );
    end if;
  end loop;
end
$$;

commit;