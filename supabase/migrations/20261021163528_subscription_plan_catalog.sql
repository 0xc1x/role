-- ─────────────────────────────────────────────────────────────────────────────
-- El catálogo de planes deja de ser código y pasa a ser dato
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── POR QUÉ EL CATÁLOGO ERA CÓDIGO, Y POR QUÉ DEJA DE SERLO ─────────────────
--
-- El catálogo del §4.5 —qué topes tiene cada plan y qué features concede—
-- vivía en DOS copias: una constante de TypeScript (`BUSINESS_PLAN_LIMITS`,
-- `BUSINESS_PLAN_FEATURES`) y los mismos números escritos a mano en el cuerpo
-- de los triggers. Entre dos copias no hay nada que las ate: el dueño lee «2
-- miembros» en el panel, el motor corta en 3, y nada en el sistema se da cuenta.
-- Esa es exactamente la clase de mentira que el §4.5 dice que no quiere.
--
-- Con esta migración hay UNA fila por plan, y la fila es la fuente. El archivo de
-- TypeScript queda como el ESPEJO TIPADO de esta tabla: el vocabulario que el
-- compilador conoce, para que ningún consumidor escriba un `plan_code` a mano.
--
-- ─── LAS DOS TABLAS Y POR QUÉ SON DOS ───────────────────────────────────────
--
-- `subscription_plans` es el plan: sus topes, su audiencia y si está en la
-- oferta. `subscription_plan_features` es QUÉ incluye: una fila por (plan,
-- feature).
--
-- Son dos tablas y no una columna `text[]` porque esta lista se consulta con una
-- foreign key: la fila de `subscription_plan_features` tiene que poder morir con
-- su plan (`on delete cascade`), y una columna no tiene filas que mueran.
--
-- ─── `NULL` ES «SIN TOPE», Y EL `CHECK` PROHÍBE EL `0` ────────────────────────
--
-- El `pro_plus` no tiene tope: `max_locations` y `max_members` son `null`. Un
-- `0` NO es lo mismo —un `0` es un tope, y un tope de cero es un plan en el que
-- no se puede tener ni una sucursal, que es otro plan y más caro—. El CHECK
-- exige que un tope, si existe, sea un entero positivo, así que `null` y `0` no
-- se pueden confundir ni por error de tipeo ni por la tentación de usar `0` como
-- «sin tope».
--
-- ─── LA AUDIENCIA, Y POR QUÉ NO SE SIEMBRA NINGÚN PLAN DE CONSUMIDOR ─────────
--
-- `plan_audience` dice a quién se le puede asignar el plan: `business` (un
-- negocio) o `consumer` (una persona). El enum existe porque la sujeción del
-- plan va a ser genérica, pero NO se siembra ningún plan de `consumer`: no hay
-- superficie que lo ofrezca, y un plan que nadie puede comprar es una promesa
-- que nadie puede cobrar.
--
-- ─── RLS HABILITADA, CERO POLICIES, Y EL REVOKE DE LAS TRES ─────────────────
--
-- El catálogo se lee por la API (`service_role`), no por los clientes. Las dos
-- tablas llevan RLS habilitada y NINGUNA policy: lo que frena la lectura de un
-- cliente no es una policy que lo niegue, es que no hay ninguna que lo admita.
--
-- Y el `revoke truncate, trigger, references` es el mismo que llevan las otras
-- tablas de staff (`20261014002328_business_members_and_plans.sql`): son los
-- tres privilegios que ninguna policy gobierna —TRUNCATE y REFERENCES no tienen
-- un `USING` que los filtre, y TRIGGER además le deja al rol colgar su propio
-- trigger a una tabla que no es suya—. La obligación es por migración, no por
-- esquema: `20260928181714` iteró `pg_class` y YA CORRIÓ, así que no vio estas
-- dos tablas.
--
-- ─── EL SEED, Y POR QUÉ ES IDEMPOTENTE ───────────────────────────────────────
--
-- Los números son los del §4.5 y NO se tocan: `free` 1 sucursal y 2 miembros,
-- `pro` 5 y 20, `pro_plus` sin tope.
--
-- `on conflict do nothing` A SECAS, sin objetivo: el SEED es idempotente —se
-- puede volver a correr sin duplicar nada ni pisar lo que un operador haya
-- cambiado a mano: retirar un plan de la oferta es un acto legítimo sobre la
-- fila, y un seed que lo pisa lo deshace—. A secas y no con objetivo porque la
-- fila que importa es la que YA ESTÁ, sea cual sea la constraint con la que
-- choque.

create type public.plan_audience as enum ('business', 'consumer');

create table public.subscription_plans (
  code public.business_plan_code primary key,
  audience public.plan_audience not null,
  max_locations integer,
  max_members integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_limits_check check (
    (max_locations is null or max_locations > 0)
    and (max_members is null or max_members > 0)
  )
);

create table public.subscription_plan_features (
  plan_code public.business_plan_code not null references public.subscription_plans (code) on delete cascade,
  feature public.business_feature not null,
  primary key (plan_code, feature)
);

-- ─── `updated_at` LO MANTIENE UN TRIGGER ──────────────────────────────────────
--
-- La casa tiene dos costumbres y el catálogo usa la de las tablas del núcleo:
-- catorce tablas (`profiles`, `businesses`, `offers`, `orders`…) llevan
-- `set_<tabla>_updated_at` sobre `public.handle_updated_at()`, que pone `now()`
-- en la columna; las de acceso (`business_members` y compañía) NO lo llevan y
-- escriben la columna a mano en el repositorio.
--
-- El catálogo usa la primera porque su fila la edita la PLATAFORMA —retirar un
-- plan de la oferta es `is_active = false`— y una columna que dice cuándo se
-- retiró el plan no puede depender de que quien escribe se acuerde de
-- escribirla. `is_active` es justo la columna que este catálogo existe para
-- cambiar, así que es la que tiene que quedar con la fecha de verdad.
--
-- La función es la de la casa —`public.handle_updated_at()`, con `search_path`
-- vacío desde `20260507201134`—, verificada en la base viva antes de escribir
-- esto.

create trigger set_subscription_plans_updated_at
  before update on public.subscription_plans
  for each row execute function public.handle_updated_at();

alter table public.subscription_plans enable row level security;
alter table public.subscription_plan_features enable row level security;

revoke truncate, trigger, references on table
  public.subscription_plans,
  public.subscription_plan_features
from anon, authenticated;

insert into public.subscription_plans (code, audience, max_locations, max_members, is_active)
values
  -- `free`: el plan del negocio que no ha elegido nada. 1 sucursal y 2
  -- miembros. El dueño NO cuenta como miembro —el tope cuenta las filas con
  -- `role <> 'owner'`—, así que un `free` es el dueño más dos de a pie.
  ('free', 'business', 1, 2, true),
  -- `pro`: 5 sucursales Y 20 miembros. Los dos topes son ACUMULATIVOS: exceder
  -- cualquiera de los dos bloquea el crecimiento.
  ('pro', 'business', 5, 20, true),
  -- `pro_plus`: sin tope. `null` es «sin tope» y `0` sería un tope de cero,
  -- que es un plan distinto del que se vendió.
  ('pro_plus', 'business', null, null, true)
on conflict do nothing;

insert into public.subscription_plan_features (plan_code, feature)
values
  -- `free`: sólo el acceso del personal. `payments` NO viene incluido.
  ('free', 'staff_access'),
  -- `pro`: el acceso del personal más los pagos.
  ('pro', 'staff_access'),
  ('pro', 'payments'),
  -- `pro_plus`: lo de `pro` más la `visibility_plus`.
  ('pro_plus', 'staff_access'),
  ('pro_plus', 'payments'),
  ('pro_plus', 'visibility_plus')
on conflict do nothing;