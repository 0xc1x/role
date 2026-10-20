-- ─────────────────────────────────────────────────────────────────────────────
-- Los accesos de staff por sucursal, y el estado de plan de cada negocio
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── QUÉ REEMPLAZA, Y QUÉ NO TODAVÍA ───────────────────────────────────────
--
-- `public.business_ownership` tiene `business_id` como PRIMARY KEY: un negocio,
-- una sola persona con acceso, y ninguna forma de registrar a un empleado sin
-- romper el modelo. Estas tres tablas son el molde nuevo y todavía NO tocan la
-- vieja —el backfill, los helpers y el cambio de policies van después, y el ORDEN
-- importa (spec §6.2)—.
--
-- ─── DOS TABLAS DE ACCESO Y UNA DE PLAN ─────────────────────────────────────
--
-- `business_members` es QUIÉN tiene acceso. `business_member_locations` es sobre
-- QUÉ sucursales, y es tabla aparte y no una columna `location_id` porque un
-- manager de dos sucursales es UN miembro con DOS filas de alcance, no dos
-- miembros.
--
-- `business_plans_state` es el asiento de la monetización: `free`, `pro` y
-- `pro_plus` con sus límites. Nace VACÍA a propósito: todo negocio se lee como
-- `free` por un `coalesce` hasta que alguien elija un plan, y un backfill acá
-- sería una mentira sobre planes que nadie ha comprado.
--
-- ─── EL ALIAS, Y POR QUÉ SU ÍNDICE ÚNICO NO FILTRA `deleted_at` ─────────────
--
-- `business_members_alias_key` es UNIQUE sobre `lower(alias)` y NO lleva
-- `where deleted_at is null`. Los otros dos índices de esta tabla sí lo llevan, y
-- esa diferencia es la garantía entera: un índice único parcial devolvería el
-- alias a la bolsa en cuanto la fila se da de baja, y el `auth.users` de esa fila
-- puede seguir vivo. El mismo identificador volvería a pertenecer a dos personas.
-- Alias dado de baja, alias quemado.
--
-- `lower(alias)` y no `alias`: el identificador con el que se entra es el que la
-- persona teclea, y dos personas pueden escribirlo con mayúsculas distintas.
--
-- ─── POR QUÉ CADA TABLA TRAE SU PROPIO RLS Y SU PROPIO REVOKE ───────────────
--
-- Porque la obligación es por migración, no por esquema.
-- `20260928181714_revoke_client_destructive_privileges.sql` itera `pg_class`
-- filtrado por `relrowsecurity` y YA CORRIÓ: su versión es anterior a esta, así
-- que no vio estas tres tablas. Y `public.rls_auto_enable()` existe en
-- producción pero no está colgada de ningún event trigger, así que no habilita
-- nada sola —medido, no supuesto, en `enable-rls.rls.db.spec.ts`—. Truncate,
-- trigger y references no los gobierna ninguna policy, porque no hay `USING` que
-- los filtre, y TRIGGER además le deja al rol colgar su propio trigger a una
-- tabla que no es suya.
--
-- ─── NO HAY UNA SOLA POLICY, Y CADA AUSENCIA ES UNA DECISIÓN ────────────────
--
-- El alta de accesos requiere `service_role` (`admin.createUser`), que está
-- fuera de una sesión normal: el cliente solo lee estas dos tablas, y el grant de
-- lectura llega en el paso 9 del §6.2 del spec, junto con la policy que lo
-- acompaña. Lo que frena la escritura por ahora es la AUSENCIA de policy, que es
-- justo lo que RLS sabe hacer.
--
-- ─── `updated_at` ES EXPLÍCITO, Y EL BORRADO ES LÓGICO ─────────────────────
--
-- No hay trigger automático de `updated_at` en las tablas de negocio de este
-- proyecto, así que la columna se mantiene explícita, igual que en el resto. El
-- borrado es lógico —`deleted_at`—, la convención que ya usan `slides`, `tips`,
-- `categories` y email-marketing.

create type public.business_member_role as enum ('owner', 'manager', 'staff');
create type public.business_member_status as enum ('active', 'disabled');
create type public.business_plan_code as enum ('free', 'pro', 'pro_plus');
create type public.business_feature as enum ('staff_access', 'payments', 'visibility_plus');

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.business_member_role not null default 'staff',
  label text not null,
  alias text not null,          -- lo que se teclea; espejo de auth.users.email
  status public.business_member_status not null default 'active',
  session_ttl_hours integer not null default 24 check (session_ttl_hours >= 0),
  last_authenticated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index business_members_business on public.business_members (business_id)
  where deleted_at is null;
create index business_members_user on public.business_members (user_id)
  where deleted_at is null;
create unique index business_members_alias_key on public.business_members (lower(alias));

create table public.business_member_locations (
  member_id uuid not null references public.business_members (id) on delete cascade,
  location_id uuid not null references public.business_locations (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (member_id, location_id)
);

create table public.business_plans_state (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  plan_code public.business_plan_code not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.business_members enable row level security;
alter table public.business_member_locations enable row level security;
alter table public.business_plans_state enable row level security;

revoke truncate, trigger, references on table
  public.business_members,
  public.business_member_locations,
  public.business_plans_state
from anon, authenticated;