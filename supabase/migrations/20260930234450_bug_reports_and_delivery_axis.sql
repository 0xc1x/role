-- Reportes de errores sobre public.app_store, y separación del eje de entrega.
--
-- Aplica con `apply_migration` (NO `execute_sql`, NO el dashboard). El ledger
-- `supabase_migrations.schema_migrations` es la única prueba de lo que corrió; un
-- DDL aplicado por la puerta de atrás deja un entorno que `supabase db push`
-- reproduce distinto de lo que pasó. Tras aplicar, renombrar este archivo a la
-- versión que asignó el servidor y confirmar que
-- `md5sum <archivo> == md5(statements[1])` de la fila del ledger.
-- Procedimiento: supabase/migrations/README.md.
--
-- ─── QUÉ CAMBIA ───────────────────────────────────────────────────────────
--
-- 1. `status` → `delivery_status`, en la columna, en el enum y en el índice.
--    `status` era un nombre genérico para un eje concreto. `state` y `origin`
--    entran como ejes ORTOGONALES, no como variantes: `delivery_status` contesta
--    "¿llegó el aviso al equipo?" y `state` contesta "¿el bug está resuelto?".
--    El mensaje de contacto usa solo el primero y siempre con `state = NULL`.
--
-- 2. Bucket `bug_report_images` PRIVADO. Los cinco buckets del proyecto son de
--    lectura pública, pero una captura de bug puede contener pedidos,
--    direcciones y teléfonos: no puede quedar accesible solo con la URL. De ahí
--    que el panel pida URLs firmadas al API en vez de leer el bucket.
--
-- 3. `revoke select on public.app_store from anon, authenticated`.
--    `20260928184943` revocó de app_store solo `truncate, trigger, references`:
--    SELECT, INSERT, UPDATE y DELETE siguen en manos de los roles cliente, y lo
--    único que los frena hoy son las cero policies. Un solo GRANT — o una policy
--    de SELECT que alguien escriba después por comodidad — vuelve legible la
--    tabla entera, y con ella la bandeja de contactos, para cualquiera con la
--    anon key (que viaja dentro del bundle móvil). El privilegio tiene que
--    coincidir con el deny-all, y por eso el revoke va en la MISMA migración que
--    la policy que sí abre la escritura: sin él, la garantía que D6 promete
--    depende de que nadie añada una línea después.
--
-- SAFETY: el rename de la columna y del enum no es reversible sin otra
-- migración —Postgres no deshace un `rename`— y el `revoke select` deja la
-- tabla cerrada para lectura de clientes. Ambas cosas son deliberadas: §13 del
-- diseño dice que el rollback es dejar el código sin deploy, y revertir el
-- rename y el revoke devolvería el estado indefendible. Nada se borra: la
-- migración es aditiva más el rename, y no existe ninguna fila `bug_report`
-- en producción todavía.
--
-- Las policies de `storage.objects` copian la forma de
-- `20260925155445_privacy_storage_notifications_consent.sql` (líneas 66-74),
-- incluido `owner = (select auth.uid())`. El §4 del diseño abrevia esa cláusula;
-- aquí va la forma completa del repo, que además de la carpeta exige que el
-- objeto sea del propio usuario.

begin;

-- ── eje de entrega, renombrado ──────────────────────────────
alter table public.app_store rename column status to delivery_status;
alter index public.app_store_status_idx
  rename to app_store_delivery_status_idx;
alter type public.store_entry_status rename to delivery_status;

-- ── dos columnas genéricas ───────────────────────────────────
create type public.entry_origin as enum ('ios','android','pwa','web');

alter table public.app_store
  add column state  text,
  add column origin public.entry_origin;

create index app_store_state_idx on public.app_store(state);

-- ── cerrar el privilege que faltaba ────────────────────────
revoke select on public.app_store from anon, authenticated;

-- ── bucket privado de capturas ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('bug_report_images', 'bug_report_images', false);

update storage.buckets
   set file_size_limit     = 5242880,
       allowed_mime_types = array['image/jpeg','image/png','image/webp']
 where name = 'bug_report_images';

create policy "Reporters attach their own screenshots"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'bug_report_images'
    and owner = (select auth.uid())
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

create policy "Reporters read their own screenshots"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'bug_report_images'
    and owner = (select auth.uid())
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- ── el ÚNICO camino de escritura desde el cliente ───────────
create policy "Users submit bug reports"
  on public.app_store for insert to authenticated
  with check (
    namespace       = 'bug_report'
    and delivery_status = 'PENDIENTE'
    and state       = 'ABIERTO'
    and origin in ('ios','android','pwa')
    and deleted_at is null
  );

-- ── la autoría la sella el servidor ─────────────────────────
create or replace function public.stamp_bug_reporter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.value := coalesce(new.value, '{}'::jsonb)
               || jsonb_build_object('reporter_id', auth.uid()::text);
  return new;
end;
$$;

create trigger on_bug_report_stamped
  before insert on public.app_store
  for each row when (new.namespace = 'bug_report')
  execute function public.stamp_bug_reporter();

commit;
