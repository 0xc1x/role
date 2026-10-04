-- ─────────────────────────────────────────────────────────────────────────────
-- Los anuncios del operador y el acknowledgement de los obligatorios
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la version que asigno el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── DOS TABLAS, Y POR QUE ───────────────────────────────────────────────────
--
-- announcements es el contenido del operador: que escribe, cuando esta activo, a
-- quien le toca y con que urgencia. El aviso es de SALIDA, y app_store es de
-- ENTRADA —delivery_status contesta "llego el aviso al equipo?"—, asi que los dos
-- caminos de lectura son distintos y ninguno se reusa del otro.
--
-- announcement_acknowledgements es el estado de lectura del required, y existe por
-- una razon y no por simetria: un info se descarta en el dispositivo y no necesita
-- dejar rastro, mientras que un required tiene que volver en cada apertura hasta
-- que la persona lo entienda. Sin una fila que lo diga, "entendido" no se puede
-- distinguir de "cerrado sin leer".
--
-- ─── severity ES text CON CHECK, Y NO UN ENUM ─────────────────────────────────
--
-- Mismo criterio que app_store.state: un enum obliga a una migracion cada vez que
-- aparece un valor nuevo. El CHECK documenta el vocabulario sin cerrar la puerta.
--
-- ─── LA ELEGIBILIDAD ENTERA ESTA EN LA POLICY, NO EN EL CLIENTE ───────────────
--
-- El movil y el landing leen Supabase directo, asi que la consulta NO pasa por la
-- API. Con el USING de abajo, la fila que no le corresponde a alguien no llega a
-- su dispositivo. Los cinco terminos:
--
--   active                             sin el, desactivar en el panel no lo saca
--                                      de la app.
--   start_at / end_at                  sin ellos, uno vencido y uno que empieza en
--                                      un mes se ven igual desde hoy.
--   severity = info or auth.uid()      sin esto, un required LLEGA a un anonimo,
--     is not null                       que no puede acknowledge: vuelve en cada
--                                      apertura, para siempre.
--   audience_kind = all                sin el, nadie lee nada.
--   consumers/businesses/user_ids      sin ellos, un aviso dirigido llega a todo
--                                      el mundo.
--
-- ─── POR QUE auth_helpers.my_role() Y NO UN SUBQUERY A profiles ───────────────
--
-- my_role() es SECURITY DEFINER y estable, y ya lo usan las politicas de profiles
-- y de orders. Existe para saltar el RLS de profiles y que la policy no dependa
-- de que el lector tenga permiso sobre profiles.
--
-- ─── POR QUE EL ROL, Y NO EL CLAIM ────────────────────────────────────────────
--
-- Las dos policies son TO anon, authenticated y TO authenticated, nunca TO public.
-- Este repo ya tiene el contraejemplo de TO public: en reviews el predicado se
-- satisface con un sub presente, y eso hace que anon escriba filas atribuidas a un
-- usuario. Aca el ROL decide.
--
-- ─── LO QUE NO HAY, Y CADA AUSENCIA ES UNA DECISION ───────────────────────────
--
-- announcements: sin policy de INSERT, UPDATE ni DELETE. Publicar es del operador
-- y va por la API. Lo unico que frena al cliente es la ausencia de policy, que es
-- justamente lo que RLS sabe hacer.
--
-- announcement_acknowledgements: sin UPDATE ni DELETE. No hay forma de
-- des-acknowledgear, y es la decision mas cara de aca: un required entendido no
-- vuelve a aparecer nunca, ni aunque el operador lo edite. Es lo correcto —
-- re-notificar en cada edicion es peor, porque el operador edita para corregir
-- una errata y la persona ya entendio lo que se le iba a pedir— y por eso el ack
-- es de la FILA y no de su contenido.
--
-- ─── force row level security, NO ────────────────────────────────────────────
--
-- Ninguna migracion de este ledger lo usa. Forzado, el rol dueno —con el que la
-- API escribe— pagaria el USING en cada fila, y el active de una fila que la API
-- acaba de desactivar dejaria de ser escribible.
--
-- ─── business_ids: LA COLUMNA EXISTE Y LA POLICY NO LA LEE ────────────────────
--
-- Asimetria explicita, no un olvido. El diseno (D5) la pide para apuntar a
-- negocios concretos, y el endpoint de publicacion valida que un specific traiga al
-- menos un id en user_ids O en business_ids. Con la policy de este archivo, un
-- specific cargado solo con business_ids es INVISIBLE PARA TODOS: no matchea all,
-- ni consumers, ni businesses, y user_ids @> array[auth.uid()] es falso porque el
-- arreglo viene vacio.
--
-- Se deja asi a proposito. Las dos salidas —que la API resuelva los negocios a sus
-- user_ids al publicar, o que la policy mire business_ownership— son decisiones de
-- producto con consecuencias propias, y la segunda ademas tocaria el spec de RLS y
-- el modelo de permisos. Ninguna se toma desde un DDL.
--
-- El indice GIN de business_ids se crea igual: es el que va a necesitar cualquiera
-- de las dos salidas, y el dia que una escriba sobre el ya esta pagado.
--
-- ─── EXPLAIN DEL INDICE PARCIAL ───────────────────────────────────────────────
--
-- El indice (active, priority desc, created_at desc) where active existe para que
-- la consulta de la app no ordene el conjunto filtrado. Es PARCIAL porque la
-- consulta siempre trae active, y un indice que guarda filas que nadie lee es
-- costo de escritura. Este archivo afirma la FORMA del indice, no que el planner
-- lo elija: el plan depende del volumen.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 3 and 2000),
  severity text not null check (severity in ('info', 'required')),
  audience_kind text not null check (audience_kind in ('all', 'consumers', 'businesses', 'specific')),
  user_ids uuid[] not null default '{}',
  business_ids uuid[] not null default '{}',
  priority integer not null default 0,
  active boolean not null default true,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcement_acknowledgements (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index announcements_active_priority_created_at_idx
  on public.announcements (active, priority desc, created_at desc)
  where active;

create index announcements_user_ids_idx
  on public.announcements using gin (user_ids);

create index announcements_business_ids_idx
  on public.announcements using gin (business_ids);

alter table public.announcements enable row level security;
alter table public.announcement_acknowledgements enable row level security;

create policy "Anyone reads the announcements they are eligible for"
  on public.announcements
  for select
  to anon, authenticated
  using (
         active
     and (start_at is null or now() >= start_at)
     and (end_at is null or now() < end_at)
     and (severity = 'info' or auth.uid() is not null)
     and (
           audience_kind = 'all'
        or (audience_kind = 'consumers' and auth_helpers.my_role() = 'user')
        or (audience_kind = 'businesses' and auth_helpers.my_role() = 'business')
        or user_ids @> array[auth.uid()]
     )
  );

create policy "Users read their own acknowledgements"
  on public.announcement_acknowledgements
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users acknowledge for themselves"
  on public.announcement_acknowledgements
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Truncate, Trigger y References no los gobierna ninguna policy: no hay USING que
-- los filtre, y TRIGGER ademas le deja al rol colgar su propio trigger a una tabla
-- que no es suya.
--
-- El revoke viaja aca porque 20260928181714_revoke_client_destructive_privileges.sql
-- itera pg_class filtrado por relrowsecurity y YA CORRIO: su version es anterior a
-- esta, asi que no vio estas dos tablas y el alter default privileges de Supabase
-- las dejo con las tres. Es el mismo hueco que
-- 20260928184943_enable_rls_on_unrecorded_tables.sql cerro para otras cinco.
revoke truncate, trigger, references on table
  public.announcements,
  public.announcement_acknowledgements
from anon, authenticated;