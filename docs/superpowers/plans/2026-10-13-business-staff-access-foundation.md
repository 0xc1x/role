# Business Staff Access — Plan 1: Foundation (DB)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar `business_ownership` (1:1 por PK) por `business_members` + `business_member_locations` con roles y alcance por sucursal, agregar la columna de sucursal a `orders`, y dejar el gate de permisos en una sola función.

**Architecture:** Tres tablas nuevas (`business_members`, `business_member_locations`, `business_plans_state`) con soft-delete. Una sola función `SECURITY DEFINER` decide el acceso y todas las policies y RPCs pasan por ella, en vez de repetir el `exists (... business_ownership ...)` inline que hoy está en ~20 policies y 3 RPCs. Las policies viejas siguen válidas mientras `business_ownership` exista, así que la sustitución se hace en dos tiempos y es reversible.

**Tech Stack:** PostgreSQL (Supabase), RLS, `SECURITY DEFINER` helpers, Drizzle ORM (espejo en TypeScript), bun:test con harness de replay (`apps/api/test/supabase-platform.ts`).

**Spec:** `docs/superpowers/specs/2026-10-13-business-staff-access-design.md` — las secciones 4, 5 y 6 son las que gobiernan este plan.

## Global Constraints

- **Toda migración entra por `apply_migration`.** Nunca `execute_sql`, nunca el dashboard, nunca `psql`. Después: leer la versión que asignó el servidor, renombrar el archivo a `<version>_<name>.sql`, y probar `md5sum <archivo>` == `md5(statements[1])` del ledger. Procedimiento en `supabase/migrations/README.md` §"How to apply a migration".
- **No reescribir ninguna migración ya aplicada.** El `md5sum` de un archivo aplicado es la única prueba de qué corrió; editarlo la destruye. Todo cambio es una migración nueva.
- **Toda tabla nueva en `public` trae su propio `alter table … enable row level security` y su propio `revoke truncate, trigger, references`.** No hay event trigger que lo haga: la obligación es por migración. Patrón de `20261004022647_announcements.sql`.
- **El conteo de tablas de `public` está pineado en 41 en cuatro lugares.** Sube a 44 con este plan: `apps/api/src/database/security/enable-rls.rls.db.spec.ts:122` y `:155`, y `apps/api/src/database/security/destructive-privileges.rls.db.spec.ts:178` y `:324`. Esos pines son los que convierten la obligación en algo que falla ruidosamente.
- **Cada helper SQL es `STABLE SECURITY DEFINER` con `SET search_path = ''`** y se le revoca el acceso a `anon`/`authenticated` salvo que una policy lo necesite explícitamente. Patrón de `public.business_is_approved`.
- **Todo índice parcial lleva `where deleted_at is null`.** Patrón de `slides`, `tips`, `categories` y email-marketing.
- **Ninguna verificación puede contener un `UPDATE`.** En Postgres un CTE data-modifying no es dry run: ejecuta. Toda comprobación es un `SELECT`. La lección está escrita en `supabase/migrations/README.md`.
- **No tocar `profiles.app_role` ni `handle_new_user()`.**
- Verificación obligatoria antes de declarar hecho: `bun run typecheck && bun run test`.

## Review Focus

Cinco condiciones que el spec promete y que un test ingenuo no ejercita. Cada una tiene su test en la tarea dueña, anotado abajo.

1. **Grandfathering.** Un negocio con 3 sucursales bajo plan `free` (límite 1). Comportamiento esperado: sigue operando, lee y edita todo lo que ya tiene; lo único bloqueado es crear una cuarta. Un negocio existente nunca se degrada. → Task 7
2. **Alias no reciclable.** Se elimina un acceso (soft-delete + ban) y el dueño crea otro con el mismo alias. Comportamiento esperado: falla con error explícito, porque el índice único de alias incluye las filas borradas y el `auth.users` podría seguir vivo. → Task 2
3. **Sesión TTL vencida a media operación.** Un `staff` lleva 26 h de sesión y está guardando un pedido. Comportamiento esperado: pérdida de escritura limpia y distinguible de "no autorizado", con `business_member_session_state()` diciendo `reason = 'session_expired'`, no un error genérico. → Task 4
4. **Alcance de `manager` contenido.** Un `manager` de la sucursal Centro intenta administrar un acceso cuya única sucursal es Norte. Comportamiento esperado: no lo ve ni en el listado y un `403` si lo fuerza; `owner` sí lo ve. → Task 5
5. **`disabled` corta en el acto, incluso en sesión persistente.** Un tablet con sesión sin expiración (`session_ttl_hours = 0`) pertenece a un acceso que el dueño pausa. Comportamiento esperado: la siguiente escritura del tablet falla con 401 y la app vuelve al login explicando que el acceso fue desactivado. → Task 5

---

### Task 1: `orders.business_location_id`, derivado por trigger

**Files:**
- Create: `supabase/migrations/<version>_orders_business_location.sql`
- Modify: `apps/api/src/database/schema/orders.ts` (agregar la columna al espejo Drizzle)
- Test: `apps/api/src/database/security/orders.rls.db.spec.ts`

**Interfaces:**
- Consumes: nada de tareas previas.
- Produce: `public.orders.business_location_id uuid NOT NULL`, FK compuesta `(business_location_id, business_id)` → `public.business_locations (id, business_id)`. La API y el móvil la leen desde la Task 7 en adelante.

- [ ] **Step 1: Escribir el test que falla**

En `orders.rls.db.spec.ts`, añadir un bloque que siembre una oferta en `LOC_A` de `BIZ_A`, reserve un pedido y afirme que el pedido trae la sucursal de la oferta:

```ts
test('el pedido hereda la sucursal de su oferta', async () => {
  const rows = await as(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe<{ business_location_id: string }[]>(`
      insert into public.offers (
        business_id, business_location_id, title, original_price, discounted_price
      ) values ('${BIZ_A}', '${LOC_A}', 'oferta', 10, 5)
      returning id`), );
  await as(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe(`
      insert into public.orders (
        user_id, offer_id, business_id, order_number, price, original_price,
        pickup_code, status
      ) values ('${MEMBER}', '${rows[0].id}', '${BIZ_A}', 'TEST-1', 5, 10, 'ABC123', 'confirmed')`),
  );
  const read = await as(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe<{ business_location_id: string }[]>(`
      select business_location_id from public.orders where order_number = 'TEST-1'`),
  );
  expect(read[0].business_location_id).toBe(LOC_A);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd apps/api && bun test --isolate src/database/security/orders.rls.db.spec.ts`
Expected: FAIL — `column "business_location_id" does not exist`.

- [ ] **Step 3: Escribir la migración**

Contenido, en este orden:

```sql
alter table public.orders add column business_location_id uuid;

alter table public.orders
  add constraint orders_location_business_fkey
    foreign key (business_location_id, business_id)
    references public.business_locations (id, business_id) on delete restrict;

update public.orders o set business_location_id = f.business_location_id
  from public.offers f where f.id = o.offer_id;

-- Falla ruidosa si algún pedido quedó sin sucursal en vez de dejar NOT NULL de lado.
do $$
declare missing integer;
begin
  select count(*) into missing from public.orders where business_location_id is null;
  if missing > 0 then
    raise exception 'orders sin business_location_id: %', missing;
  end if;
end $$;

alter table public.orders alter column business_location_id set not null;

-- Deriva la columna en cada insert, included el de reserve_offer.
create or replace function public.set_order_business_location()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  select f.business_location_id into new.business_location_id
  from public.offers f where f.id = new.offer_id;
  if new.business_location_id is null then
    raise exception 'la oferta % no existe, no se puede derivar la sucursal', new.offer_id;
  end if;
  return new;
end $fn$;

create trigger trg_set_order_business_location
  before insert on public.orders
  for each row execute function public.set_order_business_location();
```

**Por qué un trigger y no reescribir `reserve_offer`** — el spec §6.1 dice "`reserve_offer` escribe la columna". Eso se cambió a propósito. `reserve_offer` es un `SECURITY DEFINER` endurecido por tres migraciones distintas, y `20260927025753_businesses_drop_sensitive_columns.sql` reescribe cuerpos localizando texto literal y aborta si el literal no está. Reescribirlo exige reproducir su cuerpo actual byte a byte y sumar una línea. Un `BEFORE INSERT` trigger obtiene lo mismo para **todos** los caminos de escritura —incluido `reserve_offer`— sin tocar una función que el repo ya documentó como frágil. Anotar esta desviación en el spec (§6.1) cuando se cierre el plan.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && bun test --isolate src/database/security/orders.rls.db.spec.ts`
Expected: PASS.

- [ ] **Step 5: Aplicar la migración y sellar el archivo**

`apply_migration` con `name: "orders_business_location"`. Luego leer la versión del ledger, renombrar el archivo a `<version>_orders_business_location.sql` y confirmar que `md5sum` del archivo == `md5(statements[1])`.

- [ ] **Step 6: Agregar la columna al espejo Drizzle**

En `apps/api/src/database/schema/orders.ts`, junto a `businessId`:

```ts
businessLocationId: uuid('business_location_id').notNull(),
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/*_orders_business_location.sql \
        apps/api/src/database/schema/orders.ts \
        apps/api/src/database/security/orders.rls.db.spec.ts
git commit -m "feat(db): orders lleva la sucursal de su oferta, derivada por trigger"
```

---

### Task 2: Las tres tablas y sus enums

**Files:**
- Create: `supabase/migrations/<version>_business_members_and_plans.sql`
- Create: `apps/api/src/database/schema/business-members.ts`
- Modify: `apps/api/src/database/schema/index.ts` (registrar en el map y en `defineRelations`)
- Modify: `apps/api/src/database/security/enable-rls.rls.db.spec.ts:122,155` (41 → 44)
- Modify: `apps/api/src/database/security/destructive-privileges.rls.db.spec.ts:178,324` (41 → 44)
- Test: `apps/api/src/database/security/business-members.rls.db.spec.ts` (nuevo)

**Interfaces:**
- Consumes: nada.
- Produce: `public.business_members`, `public.business_member_locations`, `public.business_plans_state`; enums `business_member_role`, `business_member_status`, `business_plan_code`, `business_feature`. Exportados en `schema/index.ts` como `businessMembers`, `businessMemberLocations`, `businessPlansState`.

- [ ] **Step 1: Escribir el test de forma que falla**

Nuevo `business-members.rls.db.spec.ts`. La forma de las policies se aserta completa (rol, `qual`, `with_check`), no por nombre, siguiendo `announcements.rls.db.spec.ts`.

```ts
test('las tres tablas nuevas traen RLS y sin privilegios destructivos', async () => {
  const rls = await as(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe<{ relname: string; rls: boolean }[]>(`
      select c.relname, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('business_members','business_member_locations','business_plans_state')
      order by c.relname`),
  );
  expect(rls).toEqual([
    { relname: 'business_member_locations', rls: true },
    { relname: 'business_members', rls: true },
    { relname: 'business_plans_state', rls: true },
  ]);
});

test('el índice único de alias no recicla filas borradas', async () => {
  const idx = await as(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe<{ indexdef: string }[]>(`
      select indexdef from pg_indexes
      where schemaname = 'public'
        and tablename = 'business_members'
        and indexname = 'business_members_alias_key'`),
  );
  // Un índice normal (no único) con este nombre noerdaría la garantía de §4.1.
  expect(idx).toHaveLength(1);
  expect(idx[0].indexdef).toContain('UNIQUE');
  expect(idx[0].indexdef).toContain('lower(alias)');
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
Expected: FAIL — `relation "business_members" does not exist`.

- [ ] **Step 3: Escribir la migración**

Los cuatro `create type`, las tres tablas con los CHECK y FK del spec §4, sus índices parciales, y por cada tabla su `enable row level security` + `revoke truncate, trigger, references from anon, authenticated`. La definición exacta de cada tabla está en el spec §4.1–4.3: cópiala, no la reescribas.

Dos detalles que no son negociables:

- `business_members.alias` lleva `unique index business_members_alias_key on public.business_members (lower(alias))` **sin** `where deleted_at is null`, para que un alias dado de baja no se recicle (Review Focus #2).
- `business_plans_state` nace con `plan_code default 'free'`; **no** se hace backfill de planes todavía (eso es Task 7).

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
Expected: PASS.

- [ ] **Step 5: Subir los cuatro pines de conteo a 44**

En `enable-rls.rls.db.spec.ts` líneas 122 y 155, y en `destructive-privileges.rls.db.spec.ts` líneas 178 y 324. Actualizar también el comentario de contexto que dice "41 tables" en `destructive-privileges.rls.db.spec.ts:65`.

Run: `cd apps/api && bun test --isolate src/database/security/`
Expected: PASS.

- [ ] **Step 6: Espejo Drizzle**

Crear `apps/api/src/database/schema/business-members.ts` con `businessMembers`, `businessMemberLocations` y `businessPlansState` siguiendo el estilo de `business-companions.ts`. Registrar en el map de `schema/index.ts`.

Run: `cd apps/api && bun test --isolate src/database/schema/mirror-fidelity.db.spec.ts`
Expected: PASS — el espejo y la base coinciden.

- [ ] **Step 7: Aplicar, sellar y commitear**

`apply_migration` con `name: "business_members_and_plans"`, renombrar, verificar `md5sum`, y:

```bash
git add supabase/migrations/*_business_members_and_plans.sql \
        apps/api/src/database/schema/business-members.ts \
        apps/api/src/database/schema/index.ts \
        apps/api/src/database/security/
git commit -m "feat(db): business_members, business_member_locations y business_plans_state"
```

---

### Task 3: Backfill de `business_ownership` → `business_members`

**Files:**
- Create: `supabase/migrations/<version>_backfill_business_members.sql`
- Test: `apps/api/src/database/security/business-members.rls.db.spec.ts`

**Interfaces:**
- Consumes: `business_members` de la Task 2.
- Produce: por cada fila de `business_ownership`, exactamente una fila en `business_members` con `role = 'owner'`.

- [ ] **Step 1: Escribir el test que falla**

```ts
test('todo dueño de business_ownership es un miembro owner', async () => {
  const orphans = await as(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe<{ n: number }[]>(`
      select count(*)::int as n from public.business_ownership o
      where not exists (
        select 1 from public.business_members m
        where m.business_id = o.business_id
          and m.user_id = o.owner_id
          and m.role = 'owner'
          and m.deleted_at is null
      )`),
  );
  expect(orphans[0].n).toBe(0);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
Expected: FAIL — `n` es mayor que 0 para toda fila sembrada.

- [ ] **Step 3: Escribir la migración**

```sql
insert into public.business_members (business_id, user_id, role, label, alias)
select o.business_id,
       o.owner_id,
       'owner',
       b.name,
       coalesce(p.email, o.owner_id::text || '@owner.invalid')
from public.business_ownership o
join public.businesses b on b.id = o.business_id
left join public.profiles p on p.id = o.owner_id
on conflict (business_id, user_id) do nothing;
```

El `label` del dueño es el nombre del negocio: en la UI es la fila que representa al dueño, no un nombre de persona. El `left join` a `profiles` y el `coalesce` existen porque `profiles.email` es `NOT NULL` pero el replay del harness arranca sin filas de perfil (los seeds no reproducen) y un `NOT NULL` violado abortaría la migración entera.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
Expected: PASS.

- [ ] **Step 5: Aplicar, sellar y commitear**

`apply_migration` con `name: "backfill_business_members"`, renombrar, `md5sum`, y:

```bash
git commit -am "feat(db): el dueño deja de ser una fila aparte y pasa a ser un miembro owner"
```

---

### Task 4: Los helpers de permiso

**Files:**
- Create: `supabase/migrations/<version>_staff_permission_helpers.sql`
- Test: `apps/api/src/database/security/business-members.rls.db.spec.ts`

**Interfaces:**
- Consumes: `business_members`, `business_member_locations` (Task 2).
- Produce: cuatro funciones que las Tasks 5–7 y toda la API consumen:

```sql
public.business_member_role(p_business_id uuid) -> public.business_member_role
public.can_manage_location(p_business_id uuid, p_location_id uuid) -> boolean
public.business_has_feature(p_business_id uuid, p_feature public.business_feature) -> boolean
public.business_member_session_state(p_business_id uuid default null) -> jsonb
```

`business_member_session_state` devuelve `{ role, location_ids, expires_at, reason, business_ids }`
y **se puede llamar sin argumentos**: lee `auth.uid()`, que es lo que lo hace utilizable desde
el cliente para pintar la UI. El argumento es opcional a propósito —sin él la función solo es
honesta cuando la persona tiene un negocio, y un dueño real tiene varios—, y el brief de esta
tarea lo llama sin argumento, que es el caso de un empleado con un solo negocio. La semántica
de cada llamada está en el spec §5.2.

- [ ] **Step 1: Escribir la matriz de pruebas que falla**

Primero el fixture, en el `beforeAll` del spec, sembrando con `as(ctx.sql, 'service_role', null, …)` el mismo mundo que usa `businesses.rls.db.spec.ts` (forma de uuid `aaaa…`, `1111…`):

```ts
const OWNER_A = '44444444-4444-4444-4444-444444444444';
const MEMBER_STAFF_A = '66666666-6666-6666-6666-666666666666';
const MEMBER_MANAGER = '77777777-7777-7777-7777-777777777777';
const MEMBER_DISABLED = '88888888-8888-8888-8888-888888888888';
const MEMBER_DELETED = '99999999-9999-9999-9999-999999999999';
const BIZ_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const BIZ_B = 'aaaaaaaa-0000-4000-8000-000000000002';
const LOC_A = 'bbbbbbbb-0000-4000-8000-000000000001';
const LOC_B = 'bbbbbbbb-0000-4000-8000-000000000002';
```

El mundo: `BIZ_A` con `LOC_A` y `LOC_B`; `BIZ_B` con una sola sucursal, para el caso "ni el negocio ajeno". `OWNER_A` es `owner` de `BIZ_A`. `MEMBER_STAFF_A` es `staff` con alcance solo `LOC_A` y `last_authenticated_at = now()`. `MEMBER_MANAGER` es `manager` con alcance en ambas. `MEMBER_DISABLED` es `staff` con alcance en `LOC_A` y `status = 'disabled'`. `MEMBER_DELETED` es `staff` con alcance en `LOC_A` y `deleted_at = now()`.

Y un identitario más para la prueba de sesión vencida, que necesita un `last_authenticated_at` viejo y no puede ser el mismo que los otros:

```ts
const MEMBER_STALE = 'aaaaaaaa-0000-4000-8000-00000000000a';
// staff con alcance en LOC_A, session_ttl_hours = 24,
// last_authenticated_at = now() - interval '26 hours'
```

La prueba central del feature:

```ts
test('un staff solo administra las sucursales de su alcance', async () => {
  expect(await canManage(MEMBER_STAFF_A, BIZ_A, LOC_A)).toBe(true);
  expect(await canManage(MEMBER_STAFF_A, BIZ_A, LOC_B)).toBe(false);
  expect(await canManage(MEMBER_STAFF_A, BIZ_B, LOC_A)).toBe(false); // ni el negocio ajeno
});

test('el owner administra todo el negocio y el manager también', async () => {
  expect(await canManage(OWNER_A, BIZ_A, LOC_A)).toBe(true);
  expect(await canManage(OWNER_A, BIZ_A, LOC_B)).toBe(true);
  expect(await canManage(MEMBER_MANAGER, BIZ_A, LOC_B)).toBe(true);
});

test('un acceso deshabilitado no administra nada', async () => {
  expect(await canManage(MEMBER_DISABLED, BIZ_A, LOC_A)).toBe(false);
});

test('un miembro borrado no administra nada', async () => {
  expect(await canManage(MEMBER_DELETED, BIZ_A, LOC_A)).toBe(false);
});

test('la sesión vencida se distingue de la no autorizada', async () => {
  const state = await as(ctx.sql, 'authenticated', MEMBER_STALE, (tx) =>
    tx.unsafe<{ reason: string; role: string }[]>(`
      select public.business_member_session_state() ->> 'reason' as reason,
             public.business_member_session_state() ->> 'role'  as role`),
  );
  expect(state[0].reason).toBe('session_expired');
  // El rol sigue siendo staff: lo que venció es la sesión, no el derecho.
  expect(state[0].role).toBe('staff');
});
```

con un helper local en el spec:

```ts
async function canManage(userId: string, businessId: string, locationId: string) {
  const r = await as(ctx.sql, 'authenticated', userId, (tx) =>
    tx.unsafe<{ ok: boolean }[]>(`
      select public.can_manage_location('${businessId}', '${locationId}') as ok`),
  );
  return r[0].ok;
}
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
Expected: FAIL — `function public.can_manage_location(...) does not exist`.

- [ ] **Step 3: Escribir los helpers**

Las cuatro, `STABLE SECURITY DEFINER SET search_path = ''`, con `revoke all ... from public, anon` y `grant execute ... to authenticated` solo en las que el cliente necesita (`can_manage_location`, `business_member_session_state`).

`can_manage_location` evalúa en este orden, y el orden es la regla:

1. Sin fila de `business_members` activa para `(business_id, auth.uid())` → `false`.
2. `role = 'owner'` o `role = 'manager'` → `true`.
3. `role = 'staff'` → `true` solo si existe fila en `business_member_locations` para esa `location_id` y esa fila no está borrada.
4. `session_ttl_hours > 0` y `last_authenticated_at` más viejo que ese TTL → `false`.

El paso 4 va dentro de la función y **no** es un chequeo de UI: es la regla que hace que un tablet con sesión de ayer no escriba hoy.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
Expected: PASS.

- [ ] **Step 5: Aplicar, sellar y commitear**

`apply_migration` con `name: "staff_permission_helpers"`, renombrar, `md5sum`, y:

```bash
git commit -am "feat(db): una sola función decide qué sucursal administra cada miembro"
```

---

### Task 5: Policies nuevas + RPCs, y retiro de `business_ownership`

**Files:**
- Create: `supabase/migrations/<version>_business_members_policies.sql` (policies nuevas + recreation de `cancel_order`, `set_order_status`, `validate_pickup_code`)
- Create: `supabase/migrations/<version>_drop_business_ownership.sql`
- Test: `apps/api/src/database/security/business-members.rls.db.spec.ts`, `apps/api/src/database/security/orders.rls.db.spec.ts`, `apps/api/src/database/security/businesses.rls.db.spec.ts`

**Interfaces:**
- Consumes: los helpers de la Task 4.
- Produce: toda policy de negocio resolviendo por `can_manage_location`; `business_ownership` fuera del schema.

Esta es la tarea más grande y la única que puede romper producción. El orden interno es obligatorio: **nuevo primero, viejo después**.

- [ ] **Step 1: Escribir los tests de paridad que fallan**

Para cada tabla con policy de dueño (`businesses`, `business_locations`, `offers`, `orders`, `order_events`, `business_hours`, `coupons`, `payouts`, `business_notification_preferences`, `offer_categories`, `payment_intents`, `profiles`), un test que afirme la forma de la policy nueva:

```ts
test('ninguna policy de negocio sigue resolviendo por business_ownership', async () => {
  const stale = await as(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe<{ n: number }[]>(`
      select count(*)::int as n from pg_policies
      where schemaname = 'public'
        and (qual like '%business_ownership%' or with_check like '%business_ownership%')`),
  );
  expect(stale[0].n).toBe(0);
});

test('el manager no alcanza un acceso de otra sucursal', async () => {
  const seen = await as(ctx.sql, 'authenticated', MEMBER_MANAGER, (tx) =>
    tx.unsafe<{ n: number }[]>(`
      select count(*)::int as n from public.business_members m
      join public.business_member_locations l on l.member_id = m.id
      where m.business_id = '${BIZ_A}' and l.location_id = '${LOC_B}'
        and m.role <> 'owner'`),
  );
  expect(seen[0].n).toBe(0);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd apps/api && bun test --isolate src/database/security/`
Expected: FAIL en el primer test — hay ~20 policies que matchean `business_ownership`.

- [ ] **Step 3: Escribir las policies nuevas, sin tocar las viejas**

Crear las policies con el predicado por `can_manage_location` / `business_member_role`, **conservando** las existentes. En esta migración el resultado es que cada tabla tiene dos juegos de policies con el mismo efecto, y el test `businesses.rls.db.spec.ts` que afirma "every owner policy resolves through business_ownership" hay que **dejarlo como está todavía**: pasa en este punto y solo debe cambiar en el Step 5.

Agregar además las policies de lectura de `business_members` y `business_member_locations`, que el cliente necesita y que hoy no existen:

```sql
create policy "Members can view own membership"
  on public.business_members for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

create policy "Owners and managers view business members"
  on public.business_members for select to authenticated
  using (public.business_member_role(business_id) in ('owner', 'manager'));

create policy "Owners and managers view member scope"
  on public.business_member_locations for select to authenticated
  using (exists (
    select 1 from public.business_members m
    where m.id = member_id
      and m.deleted_at is null
      and public.business_member_role(m.business_id) in ('owner', 'manager')
  ));
```

Sin policy de INSERT, UPDATE ni DELETE en ninguna de las dos: el cliente no las escribe (spec §6.3), y la ausencia de policy es lo que RLS sabe hacer.

- [ ] **Step 4: Recrear los tres RPCs y correr la suite completa**

`cancel_order`, `set_order_status` y `validate_pickup_code` resuelven el dueño con el `exists` inline. Recrearlos con `business_member_role` / `can_manage_location`, conservando la matriz de estados y los grants EXECUTE que ya tienen (`anon` en `reserve_offer` y `cancel_order`, `authenticated` en `cancel_order` y `validate_pickup_code`).

Run: `cd apps/api && bun test --isolate src/database/security/ && bun test --isolate src/modules/orders/`
Expected: PASS.

- [ ] **Step 5: Dropear `business_ownership`**

Migración aparte, que sí elimina: `drop trigger` del bootstrap si quedara colgado, `drop policy` de las dos policies de lectura, `revoke all on public.business_ownership from anon, authenticated`, y `drop table public.business_ownership`.

Ahora sí, actualizar el test de `businesses.rls.db.spec.ts` que afirma que las policies resuelven por `business_ownership` para que afirme que resuelven por `can_manage_location`, y quitarle la mención a la tabla.

Run: `cd apps/api && bun test --isolate src/database/security/`
Expected: PASS.

- [ ] **Step 6: Aplicar ambas migraciones, sellar y commitear**

`apply_migration` dos veces: `business_members_policies` y `drop_business_ownership`. Renombrar cada archivo, verificar `md5sum` de cada uno, y:

```bash
git commit -am "feat(db): las policies resuelven por membresía y se retira business_ownership"
```

Si algo sale mal entre el Step 3 y el Step 6, el punto de vuelta es el Step 5 de la Task 3: `business_ownership` sigue existiendo y sus policies viejas siguen activas, así que el sistema sigue funcionando con el modelo anterior.

---

### Task 6: Límites de plan

**Files:**
- Create: `supabase/migrations/<version>_plan_limit_guards.sql`
- Test: `apps/api/src/database/security/business-members.rls.db.spec.ts`

**Interfaces:**
- Consumes: `business_has_feature` (Task 4), `business_plans_state` (Task 2).
- Produce: triggers `trg_enforce_location_limit` y `trg_enforce_member_limit`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// BIZ_FREE: plan free (límite 1 sucursal / 2 miembros), ya con dueño + 1 members
//            y UNA sucursal activa. BIZ_GRANDFATHERED: plan free con TRES
//            sucursales activas, sembradas directo para simular el negocio que
//            ya excedió el límite antes de que existiera.
const BIZ_FREE = 'aaaaaaaa-0000-4000-8000-000000000003';
const BIZ_GRANDFATHERED = 'aaaaaaaa-0000-4000-8000-000000000004';
const USER_3 = 'dddddddd-0000-4000-8000-000000000003';
const USER_4 = 'dddddddd-0000-4000-8000-000000000004';

test('un negocio free no crea su segunda sucursal', async () => {
  const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe(`insert into public.business_locations
      (business_id, name, address, latitude, longitude)
      values ('${BIZ_FREE}', 'Segunda', 'dir', 0, 0)`),
  );
  expect(err?.message).toContain('plan free');
});

test('el dueño no cuenta para el tope de miembros', async () => {
  // Ya hay dueño + 1 staff; este es el segundo y debe entrar.
  const ok = await as(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe(`insert into public.business_members
      (business_id, user_id, role, label, alias)
      values ('${BIZ_FREE}', '${USER_3}', 'staff', 'Segundo', 'segundo@x.role.ec')
      returning id`),
  );
  expect(ok).toHaveLength(1);

  // Y el tercero es el que rebota: el dueño no consumió cupo.
  const err = await deniedAs(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe(`insert into public.business_members
      (business_id, user_id, role, label, alias)
      values ('${BIZ_FREE}', '${USER_4}', 'staff', 'Tercero', 'tercero@x.role.ec')`),
  );
  expect(err?.message).toContain('plan free');
});

test('un negocio por encima del límite sigue operando', async () => {
  // Grandfathering: 3 sucursales bajo plan free. Nada de esto puede fallar.
  const ok = await as(ctx.sql, 'service_role', null, (tx) =>
    tx.unsafe(`update public.business_locations set name = 'Renombrada'
               where business_id = '${BIZ_GRANDFATHERED}' and is_active = true
               returning id`),
  );
  expect(ok).toHaveLength(3);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
Expected: FAIL — la segunda y la tercera sucursal se insertan sin resistencia.

- [ ] **Step 3: Escribir los triggers**

`BEFORE INSERT OR UPDATE` sobre `business_locations` y sobre `business_members`. Los mensajes de error llevan el `plan_code` para que la UI pueda decir qué pasó.

El conteo de miembros filtra `role <> 'owner'` y `deleted_at is null`; el de sucursales cuenta solo `is_active`. El trigger de `business_members` **no** salta a los dueños: si `NEW.role = 'owner'` devuelve la fila sin contar nada, porque un owner nunca consume cupo (spec §5.4).

El cuerpo completo del trigger de miembros —los topes van en un `case` porque cada plan tiene un número distinto y `pro_plus` no tiene ninguno:

```sql
create or replace function public.enforce_business_member_limit()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_plan     public.business_plan_code;
  v_limit    integer;
begin
  if new.role = 'owner' then
    return new;                      -- el dueño nunca consume cupo
  end if;
  if not public.business_has_feature(new.business_id, 'staff_access') then
    raise exception 'el plan % no incluye accesos de personal', v_plan;
  end if;

  select coalesce(p.plan_code, 'free'::public.business_plan_code)
    into v_plan
  from public.businesses b
  left join public.business_plans_state p on p.business_id = b.id
  where b.id = new.business_id;
  v_plan := coalesce(v_plan, 'free'::public.business_plan_code);

  v_limit := case v_plan
    when 'free'     then 2
    when 'pro'      then 20
    else null             -- pro_plus: sin tope
  end;
  if v_limit is null then
    return new;
  end if;

  if (select count(*) from public.business_members
       where business_id = new.business_id
         and role <> 'owner'
         and deleted_at is null) >= v_limit then
    raise exception 'el plan % admite hasta % miembros, no más', v_plan, v_limit;
  end if;
  return new;
end $fn$;

create trigger trg_enforce_member_limit
  before insert or update on public.business_members
  for each row execute function public.enforce_business_member_limit();
```

El de sucursales es el mismo molde con `v_limit := case v_plan when 'free' then 1 when 'pro' then 5 else null end`, contando `business_locations where business_id = new.business_id and is_active`.

Una asimetría que hay que mantener: el trigger de `business_members` salta la comprobación cuando `NEW.role = 'owner'`, pero el de `business_locations` no tiene esa salida — **una sucursal nueva siempre consume cupo**, la cree quien la cree. Un `manager` que administrara el alcance no puede crear una sucursal: la creación de sucursales es de `owner` (spec §5.3), y eso lo aplica el Plan 2 en la API, no el trigger.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
Expected: PASS.

- [ ] **Step 5: Aplicar, sellar y commitear**

`apply_migration` con `name: "plan_limit_guards"`, renombrar, `md5sum`, y:

```bash
git commit -am "feat(db): los límites del plan bloquean crecer, nunca operar"
```

---

### Task 7: Cierre del plan

**Files:**
- Modify: `docs/superpowers/specs/2026-10-13-business-staff-access-design.md` (§6.1, desviación del trigger)
- Create: `docs/decisions/ADR-0013-accesos-de-staff-por-sucursal.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produce: el registro de por qué el móvil consulta la API solo para administrar quién opera.

- [ ] **Step 1: Anotar la desviación de `reserve_offer` en el spec**

En §6.1, cambiar "`reserve_offer` escribe la columna" por la explicación del trigger `trg_set_order_business_location` y por qué no se reescribió la función.

- [ ] **Step 2: Escribir el ADR**

`ADR-0013-accesos-de-staff-por-sucursal.md`, siguiendo el formato de `docs/decisions/ADR-0011-rpc-cerradas-y-hardening.md`. Decisión: `business_members` reemplaza a `business_ownership`; el alias es un `auth.users` real bajo `role.ec`; el móvil consulta la API únicamente para administrar accesos, y opera contra Supabase directo como siempre.

- [ ] **Step 3: Verificación completa de la suite**

```sh
bun run typecheck
bun run test
bun run build
```

Expected: los tres en verde. `bun run test` incluye el replay de migraciones y los cuatro pines de conteo de tablas.

- [ ] **Step 4: Commit**

```bash
git commit -am "docs: la desviación del trigger y el ADR de accesos de staff"
```

---

## Fuera de este plan

Esto existe, está especificado y lo implementan los planes 2 y 3, que se escriben después de que este aterrice:

- **Plan 2 — Contratos y API.** Los enums y schemas de `packages/commons` (`BUSINESS_MEMBER_ROLES`, `BUSINESS_PLAN_CODES`, `BUSINESS_PLAN_FEATURES`, `BUSINESS_PLAN_LIMITS`), el módulo `staff` de la API con sus nueve rutas, la generación y el ban del PIN, y la consolidación de los predicados de propietario triplicados en los repos.
- **Plan 3 — Mobile y admin.** Los cuatro cambios del login, la sección Equipo del panel, el filtrado de configuración por rol mínimo, la edición de alias y las dos pestañas de admin.

Dos notas que el Plan 1 deja específicamente para el Plan 2, porque son consecuencias suyas y no decisiones independientes:

- La API lee el plan desde `BUSINESS_PLAN_LIMITS` en `commons`, no desde la base. **Las dos copias tienen que coincidir**: el trigger SQL cuenta en la base y el servicio cuenta en TypeScript. Si divergen, el dueño ve un número que el motor no aplica. El Plan 2 debe incluir un test que compare `BUSINESS_PLAN_LIMITS` con lo que devuelven los triggers.
- `getBusinessesByOwnerId` (`apps/mobile/src/features/business/data/repository.ts:352-376`) lee `business_ownership` y empezará a fallar en cuanto el Plan 1 cierre. **Es una regresión que el Plan 1 introduce y el Plan 3 arregla.** Si el Plan 1 se despliega solo, el panel del dueño no encuentra su negocio.