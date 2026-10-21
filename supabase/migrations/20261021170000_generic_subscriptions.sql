-- ─────────────────────────────────────────────────────────────────────────────
-- La suscripción con sujeto genérico, y la tabla que se retira
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Procedimiento: supabase/migrations/README.md. Tras aplicar, renombrar este
-- archivo a la versión que asignó el servidor y confirmar que
-- md5sum <archivo> == md5(statements[1]) de la fila del ledger.
--
-- ─── QUÉ REEMPLAZA, Y POR QUÉ EL SUJETO AHORA ES UNA COLUMNA ─────────────────
--
-- `public.business_plans_state` era el asiento de la monetización: una fila por
-- negocio, `business_id` como PRIMARY KEY, y el plan como una COLUMNA de esa
-- fila. El sujeto estaba COSIDO a la forma de la tabla: el sujeto era el
-- negocio, y no había forma de decir «esta persona tiene un plan» sin
-- inventar otra tabla con las mismas columnas.
--
-- `public.subscriptions` generaliza el sujeto a UNA COLUMNA: `business_id` para
-- un negocio y `user_id` para una persona. La fila ES la suscripción, y lo que
-- la fila dice es el plan. Hoy el único sujeto sembrado es el de negocio; la
-- columna de la persona existe y no se siembra, porque un plan que nadie puede
-- comprar es una promesa que nadie puede cobrar.
--
-- ─── POR QUÉ HAY UN CHECK Y NO UNA FK ───────────────────────────────────────
--
-- Las dos columnas son nulables a propósito —una fila de negocio tiene
-- `user_id is null` y una de persona tiene `business_id is null`—, así que la
-- integridad del sujeto NO la puede dar una foreign key: una FK dice a QUÉ
-- tabla apunta una columna, no "al menos una de las dos". El CHECK
-- `(business_id is not null) <> (user_id is not null)` dice las tres cosas de
-- una vez: hay sujeto, hay UN sujeto, y el sujeto es del tipo que dice ser.
--
-- ─── POR QUÉ `plan_code` NO ES UNA FK AL CATÁLOGO ────────────────────────────
--
-- A propósito, y es la decisión más discutible de este archivo.
--
-- Un `on delete cascade` haría que borrar un plan del catálogo se llevara
-- encima las suscripciones de los negocios que lo tienen: el negocio volvería
-- a `free` EN SILENCIO, sin que nadie lo pidiera, y su `updated_at` ni se
-- movería. Es la peor forma de perder un plan: la que no deja rastro.
--
-- Un `on delete restrict` haría lo contrario: nadie podría retirar un plan del
-- catálogo mientras un negocio lo tuviera, y la negativa del MOTOR —el
-- `else raise` que dice «este plan no está en el catálogo» en voz alta— quedaría
-- inalcanzable: el error lo daría la constraint, con otro texto y sin el
-- código que el motor usa.
--
-- El que se niega es el motor, y se niega en voz alta. La columna es el enum
-- `business_plan_code` y el motor lee el catálogo: si el enum va por delante
-- del catálogo, lo dice el motor y no una constraint.
--
-- ─── EL ÍNDICE ÚNICO PARCIAL, Y POR QUÉ ES PARCIAL ───────────────────────────
--
-- `subscriptions_live_business_key` es UNIQUE sobre `(business_id)` y lo es
-- SOLO para las filas VIVAS: `business_id is not null and cancelled_at is null
-- and deleted_at is null`.
--
-- Es parcial porque el sujeto admite HISTORIA: la suscripción cancelada se
-- queda ahí —para saber qué hubo y desde cuándo— y la nueva entra al lado. Un
-- UNIQUE sin predicado afirmaría que un negocio sólo puede haber tenido un
-- plan en toda su vida, y el historial de planes es justo lo que esta tabla
-- existe para guardar.
--
-- Y lo parcial es lo que hace que la unicidad signifique lo que dice: dos
-- filas VIVAS del mismo negocio son un plan con dos respuestas, y el motor
-- leería una de las dos.
--
-- ─── `business_plan_of`: MISMO NOMBRE, MISMA FIRMA, MISMA ACL ────────────────
--
-- La función conserva nombre, firma, `stable`, `security definer` y
-- `search_path = ''`. Lo único que cambia es de dónde lee: ahora es
-- `public.subscriptions`, y una fila es VIVA cuando `cancelled_at is null and
-- deleted_at is null` — los mismos dos motivos por los que la fila vieja
-- dejaba de contar cuando tenía `deleted_at`.
--
-- El `coalesce` a `'free'` se queda, y es la garantía de que esta migración no
-- cambia el plan de NADIE: un negocio sin suscripción se lee `free`, como
-- antes. En producción hay 16 negocios y 0 filas de plan, así que los 16 se
-- leen `free` antes y después.
--
-- Y la ACL se queda como está —`{postgres, service_role}`—, porque es lo que
-- impide que un cliente se lleve el plan de un negocio que no es suyo: la
-- función contesta «qué plan tiene ESTE negocio», así que dársela a
-- `authenticated` con cualquier id que se le ocurra es filtrar el precio de
-- los negocios de otros. `create or replace` conserva el ACL por sí solo; el
-- `revoke` de más abajo lo deja indefenso por sí mismo, para que un default
-- que se ampliara no devuelva EXECUTE sin que nadie lo pidiera.
--
-- ─── `updated_at` LO MANTIENE UN TRIGGER ──────────────────────────────────────
--
-- La casa tiene dos costumbres. Catorce tablas del núcleo (`profiles`,
-- `businesses`, `offers`, `orders`…) llevan `set_<tabla>_updated_at` sobre
-- `public.handle_updated_at()`, que pone `now()` en la columna; las de acceso
-- (`business_members` y compañía) NO lo llevan y escriben la columna a mano en
-- el repositorio.
--
-- `subscriptions` es de las SEGUNDAS por linaje —sustituye a
-- `business_plans_state`, que era una de ellas— y de las PRIMERAS por quién
-- escribe: la fila la escribe la PLATAFORMA, que es la que asigna el plan, y
-- no el dueño. Y una suscripción es el REGISTRO DE UN CICLO VITAL: tiene
-- `started_at`, tiene `cancelled_at`, y su `updated_at` dice cuándo se cambió
-- el plan por última vez. Una columna que dice eso no puede depender de que
-- quien escribe se acuerde de escribirla.
--
-- La función es la de la casa —`public.handle_updated_at()`, con `search_path`
-- vacío desde `20260507201134`— y está en producción: el catálogo
-- (`20261021163528_subscription_plan_catalog.sql`) ya la usa en un trigger.
--
-- ─── RLS HABILITADA, CERO POLICIES, Y EL REVOKE DE LAS TRES ─────────────────
--
-- La suscripción se lee y se escribe por la API (`service_role`), no por los
-- clientes. La tabla lleva RLS habilitada y NINGUNA policy: lo que frena la
-- lectura de un cliente no es una policy que lo niegue, es que no hay ninguna
-- que lo admita. Es la misma postura que `business_plans_state` y que el
-- catálogo, y por el mismo motivo.
--
-- Y el `revoke truncate, trigger, references` es el mismo que llevan las
-- tablas de staff (`20261014002328_business_members_and_plans.sql`): son los
-- tres privilegios que ninguna policy gobierna —TRUNCATE y REFERENCES no tienen
-- un `USING` que los filtre, y TRIGGER además le deja al rol colgar su propio
-- trigger a una tabla que no es suya—. La obligación es por migración, no por
-- esquema: `20260928181714` iteró `pg_class` y YA CORRIÓ, así que no vio esta
-- tabla.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  plan_code public.business_plan_code not null,
  started_at timestamptz not null default now(),
  cancelled_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_subject_check check (
    (business_id is not null) <> (user_id is not null)
  )
);

create unique index subscriptions_live_business_key on public.subscriptions (business_id)
  where business_id is not null and cancelled_at is null and deleted_at is null;

create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.handle_updated_at();

alter table public.subscriptions enable row level security;

revoke truncate, trigger, references on table
  public.subscriptions
from anon, authenticated;

-- La función conserva nombre, firma y ACL. Lo que cambia es la tabla de la que
-- lee, y el `coalesce` a `'free'` —la ausencia de fila— que no se toca.
--
-- La fila VIVA es la que concede el plan: la cancelada y la archivada se
-- quedan para decir qué hubo, no para contar. Y el índice único parcial es lo
-- que garantiza que haya como mucho una: si hubiera dos, esta consulta
-- fallaría en voz alta en vez de elegir una al azar.
create or replace function public.business_plan_of(p_business_id uuid)
returns public.business_plan_code
language sql
stable
security definer
set search_path = ''
as $$
  -- Ausencia de fila y fila muerta son la misma cosa: `free`. El
  -- `cancelled_at is null and deleted_at is null` es lo que impide que una
  -- suscripción retirada siga concediendo features —y contando topes— desde la
  -- fila que lo dejó atrás.
  select coalesce(
    (select s.plan_code
       from public.subscriptions s
      where s.business_id = p_business_id
        and s.cancelled_at is null
        and s.deleted_at is null),
    'free'::public.business_plan_code
  )
$$;

-- El revoke queda indefenso por sí mismo: un default de privilegios que se
-- ampliara le devolvería EXECUTE a esta función sin que nadie lo pidiera.
revoke all on function public.business_plan_of(uuid) from public, anon, authenticated;

-- ─── LA TABLA QUE SE RETIRA, Y POR QUÉ NO HAY BACKFILL ─────────────────────
--
-- `public.business_plans_state` está VACÍA en producción: medido el 2026-10-21,
-- 0 filas y 16 negocios. Ningún negocio ha elegido un plan todavía, y sembrar
-- `free` en los 16 sería afirmar una compra que nadie hizo.
--
-- Por eso `drop table` no pierde nada y no necesita backfill: no hay filas que
-- migrar. Lo que mantiene el plan de los 16 sin cambio es el `coalesce` de
-- `business_plan_of`, que es la misma garantía que sostenía la tabla vieja.
--
-- Y el `drop` va AL FINAL, después de reescribir la función: la única cosa en
-- toda la base que leía esta tabla era `public.business_plan_of`, y si la tabla
-- se fuera antes, la función nueva no tendría de dónde leer. El `drop` es sin
-- `cascade` a propósito: si algo dependiera de esta tabla y no estuviera
-- medido, la migración tiene que LOQUEAR y no llevársela por delante.
drop table public.business_plans_state;