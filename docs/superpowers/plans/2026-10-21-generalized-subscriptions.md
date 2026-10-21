# Plan 5 — Suscripciones generalizadas, catálogo en tablas

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el catálogo de planes deje de ser código y pase a ser dato, que el
negocio tenga una **suscripción** en vez de una columna de plan, que el sujeto sea
genérico (negocio hoy, persona mañana) y que el admin de plataforma pueda ver y
asignar el plan a mano.

**Architecture:** El catálogo (límites y features) se muda a tablas
`subscription_plans` / `subscription_plan_features`, y los dos triggers que hoy
llevan los topes **escritos a mano** pasan a leerlos de ahí: se acaba la segunda
copia que el guard test venía vigilando con un regex sobre `pg_proc`. El estado
del negocio deja de ser `business_plans_state` (una fila por negocio con una
columna `plan_code`) y pasa a ser `subscriptions`, cuya sujeción es un negocio
**o** un perfil, con integridad referencial real por dos columnas nulas y un
check. `business_plan_of()` conserva su nombre, su ACL y su `coalesce` a `free`:
los triggers y `business_has_feature` no cambian de contrato.

**Tech Stack:** Postgres 17 (Supabase) con migraciones por `apply_migration`;
NestJS 11 + drizzle (apps/api); `@0xc1x/role-commons` como SSOT; TanStack Start +
shadcn/Base UI (apps/admin); `bun:test` con base real (`createSupabaseTestDb`).

**Spec:** `docs/superpowers/specs/2026-10-13-business-staff-access-design.md`
(§4.5 catálogo, §5.3 los topes como trigger, §5.4 graceful, §10 admin, §12 fuera de
alcance) y `docs/decisions/ADR-0013-accesos-de-staff-por-sucursal.md`.

## Global Constraints

- **Toda migración entra por `apply_migration`**, nunca por `execute_sql` ni por el
  dashboard. Tras aplicar: renombrar el archivo a la versión que asignó el servidor
  y confirmar `md5sum` del archivo == `md5(statements[1])` del ledger
  (`supabase/migrations/README.md`). Los archivos sellados no se editan: se corrige
  con una migración nueva.
- Los archivos de migración terminan en `;` y sin salto de línea final. Las
  consultas de verificación son `SELECT`-only.
- **La regla del negocio no cambia:** el plan bloquea **crecer**, nunca operar
  (§5.4). Un negocio por encima del tope de su plan sigue operando.
- Los números del catálogo son los del §4.5 y **no se tocan** en este plan:
  `free` 1 sucursal / 2 miembros; `pro` 5 / 20; `pro_plus` sin tope (`null`, que no
  es `0`). Features: `free` → `staff_access`; `pro` → + `payments`; `pro_plus` → +
  `visibility_plus`.
- El tipo Postgres `business_feature` **conserva su nombre**: es la firma de
  `business_has_feature(uuid, business_feature)`. Mudar de carpeta en commons no
  renombra nada en SQL.
- `packages/commons` es SSOT: el cambio de contratos y **todos** sus consumidores
  entran en el mismo PR; `bun run typecheck` en la raíz es el que lista el blast radius.
- `bun run typecheck`, `bun run test` y `bun run build` verdes. Conventional commits,
  sin `Co-Authored-By` ni atribución de IA.

## Fuera de este plan (decidido con el partner, 2026-10-21)

- **Pasarela de pagos y cobro automático.** El admin asigna el plan a mano y el cobro
  se resuelve por fuera.
- **Precios.** No hay columnas de precio: un precio que nadie cobra es una promesa.
  Entran con la pasarela, en el mismo movimiento que las suscripciones recurrentes.
- **Facturación electrónica del SRI.** Trabajo de cumplimiento, no de código, y
  depende de que exista cobro.
- **Planes de consumidor.** La tabla los admite (`audience = 'consumer'`, sujeción a
  un perfil) y **no se siembra ninguno** ni hay superficie que los ofrezca.
- **Superficie móvil del plan.** El panel no muestra ni cambia el plan: el tope se
  explica solo cuando se choca con él (`R0001`), que es el único momento en que el
  dueño necesita saberlo. Se registra como trabajo siguiente.

## Review Focus

- **Un negocio sin fila de suscripción**: sigue leyéndose `free` por el `coalesce`,
  con 1 sucursal y 2 miembros. Si la migración pierde ese caso, 16 negocios en
  producción cambian de plan sin que nadie lo pida.
- **Un plan en el catálogo con un límite mal escrito**: el motor tiene que negarse
  ruidosamente, nunca caer a "sin tope" — el `else raise` de hoy es la diferencia
  entre un error visible y un negocio regalando cupos.
- **Cambiar un tope en la tabla**: el número que el motor hace cumplir y el número
  que el motor dice en voz alta salen de la misma fila. Si se separan, se le miente
  al dueño justo cuando llega al tope.
- **Bajar de plan a un negocio que ya está por encima**: nadie queda fuera de su
  negocio; el plan sólo bloquea crecer.
- **Una suscripción de consumidor**: hoy no existe ninguna, y `business_plan_of` no
  debe verla aunque comparta tabla.

---

### Task 1: Los contratos de suscripción en `packages/commons`

**Files:**
- Create: `packages/commons/src/subscription/enums/plan-audience.ts`
- Create: `packages/commons/src/subscription/schemas/subscription-plan.schema.ts`
- Create: `packages/commons/src/subscription/schemas/business-subscription.schema.ts`
- Create: `packages/commons/src/subscription/dtos/subscription.dto.ts`
- Create: `packages/commons/src/subscription/index.ts`
- Move: `packages/commons/src/business/enums/business-plan.ts` → `packages/commons/src/subscription/enums/business-plan.ts` (mismo contenido, sin renombrar exports)
- Modify: `packages/commons/src/business/index.ts` (quitar el export del archivo movido), `packages/commons/src/index.ts` (exportar el dominio nuevo)
- Test: `packages/commons/src/subscription/__tests__/subscription-plan.schema.test.ts`

**Interfaces:**
- Produce: `PLAN_AUDIENCES = ["business","consumer"] as const` y `PlanAudience`; `PlanAudienceSchema` y `BusinessFeatureSchema` (el `z.enum` de `BUSINESS_FEATURES`, que hoy tampoco existe); `SubscriptionPlanSchema` y `BusinessSubscriptionSchema`, los dos `.strict()` y con la misma forma de límites, para que el panel no tenga que conocer dos dialectos:

```ts
export const SubscriptionLimitsSchema = z.object({
  max_locations: z.number().int().positive().nullable(), // null = sin tope
  max_members: z.number().int().positive().nullable(),
}).strict();

export const SubscriptionPlanSchema = z.object({
  code: BusinessPlanCodeSchema,
  audience: PlanAudienceSchema,
  limits: SubscriptionLimitsSchema,
  features: z.array(BusinessFeatureSchema),
}).strict();

export const BusinessSubscriptionSchema = z.object({
  business_id: UuidSchema,
  plan_code: BusinessPlanCodeSchema,
  since: TimestamptzSchema.nullable(),
  limits: SubscriptionLimitsSchema,
  features: z.array(BusinessFeatureSchema),
}).strict();
```

`UpdateBusinessSubscriptionSchema = z.strictObject({ plan_code: BusinessPlanCodeSchema })`; y los DTO inferidos `SubscriptionPlanDto`, `BusinessSubscriptionDto`, `UpdateBusinessSubscriptionDto`.
- Produce además: `BusinessPlanCodeSchema` (el `z.enum` del enum que hoy no existe: el archivo actual no exporta ningún schema zod, y el API lo necesita para validar el cuerpo).

- [x] **Step 1: El test de los contratos**

`SubscriptionPlanSchema` acepta `{ code: "pro_plus", audience: "business", limits: { max_locations: null, max_members: null }, features: ["staff_access","payments","visibility_plus"] }` y **rechaza** `limits.max_members: 0` (un tope de cero no es "sin tope") y `features: ["pagos"]` (un valor fuera de `BUSINESS_FEATURES`). `UpdateBusinessSubscriptionSchema` rechaza `{ plan_code: "premium" }`.

- [x] **Step 2: Correr y ver que falla**

Run: `cd packages/commons && bun test src/subscription`
Expected: FAIL — `Cannot find module`

- [x] **Step 3: Escribir los contratos y mover el archivo**

El archivo de códigos y del espejo de límites se muda sin cambiar nombres de
export. `packages/commons/src/business/index.ts` deja de exportarlo; el dominio
nuevo sí. El comentario de cabecera del archivo movido se actualiza: ya no dice
"cuando existan precios o tiers por tamaño esto se mueve a tablas" — se movió, y
ahora es el espejo tipado de las tablas, no la fuente.

- [x] **Step 4: Correr el typecheck de la raíz y ver el blast radius**

Run: `bun run typecheck`
Expected: FAIL — los consumidores que importaban desde `business/enums/business-plan`
(el guard test `apps/api/src/database/security/plan-limits.db.spec.ts` y cualquier
otro que el compilador liste). Anotarlos: se arreglan en este mismo plan.

- [x] **Step 5: Actualizar los imports de los consumidores**

Sólo cambia la ruta del import; ningún valor cambia.

- [x] **Step 6: Correr y verificar**

Run: `bun run typecheck && cd packages/commons && bun test`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add packages/commons apps/api
git commit -m "feat(commons): contratos de suscripción y catálogo de planes"
```

---

### Task 2: El catálogo en tablas

**Files:**
- Create: `supabase/migrations/<version>_subscription_plan_catalog.sql`
- Modify: `apps/api/src/database/security/plan-limits.db.spec.ts` (las dos mitades que hoy leen `pg_proc` para enum y features)
- Modify: `apps/api/src/database/schema/business-members.ts` (drizzle: `subscriptionPlans`, `subscriptionPlanFeatures`, `planAudienceEnum`)

**Interfaces:**
- Produce: `public.subscription_plans(code public.business_plan_code primary key, audience public.plan_audience not null, max_locations integer, max_members integer, is_active boolean not null default true, created_at, updated_at)` con `check ((max_locations is null or max_locations > 0) and (max_members is null or max_members > 0))`; `public.subscription_plan_features(plan_code public.business_plan_code references public.subscription_plans on delete cascade, feature public.business_feature not null, primary key (plan_code, feature))`; `create type public.plan_audience as enum ('business','consumer')`.

- [x] **Step 1: El test del catálogo, contra las tablas**

En `plan-limits.db.spec.ts`, las dos assertions que hoy parsean `pg_proc` pasan a
leer las tablas: `select code, audience, max_locations, max_members from
public.subscription_plans order by code` comparado con `BUSINESS_PLAN_CODES` +
`BUSINESS_PLAN_LIMITS` (celda por celda, `null` incluido), y `select plan_code,
feature from public.subscription_plan_features order by plan_code, feature`
comparado con `BUSINESS_PLAN_FEATURES`. La assertion del enum (`pg_enum` ==
`BUSINESS_PLAN_CODES`) se queda como está. `is_active` **no** entra en la
comparación: es operativo —retirar un plan de la oferta sin borrarlo— y no tiene
espejo en TypeScript; el test lo dice para que nadie lo agregue al espejo por
simetría.

- [x] **Step 2: Correr y ver que falla**

Run: `cd apps/api && bun test src/database/security/plan-limits.db.spec.ts`
Expected: FAIL — `relation "public.subscription_plans" does not exist`

- [x] **Step 3: La migración**

Tablas + enum + seed **con los números del §4.5**, RLS habilitada, **cero policies**
y el mismo `revoke truncate, trigger, references` que llevan las otras tablas de
staff: el catálogo se lee por la API (`service_role`), no por los clientes. El
seed es idempotente (`on conflict do nothing`) y nombra el porqué de cada número
con el plan al que pertenece.

- [x] **Step 4: Aplicar y verificar la migración**

Run: `apply_migration` con el nombre del archivo; después renombrar al versionado
del servidor y `md5sum` contra el ledger. Verificación `SELECT`-only: una fila por
plan, las features por plan, y `relrowsecurity = true` en las dos tablas.

- [x] **Step 5: El espejo de drizzle**

`subscriptionPlans` y `subscriptionPlanFeatures` en el schema, y regenerar
`apps/api/drizzle/` (`bunx drizzle-kit generate`). **No se commitea** `drizzle/`:
es generado y está en `.gitignore`, pero `mirror-fidelity.db.spec.ts` lo necesita
fresco.

- [x] **Step 6: Correr y verificar**

Run: `cd apps/api && bun test src/database && bun run typecheck`
Expected: PASS, incluido `mirror-fidelity`

- [x] **Step 7: Commit**

```bash
git add supabase/migrations apps/api/src/database
git commit -m "feat(db): el catálogo de planes en tablas"
```

---

### Task 3: La suscripción genérica

**Files:**
- Create: `supabase/migrations/<version>_generic_subscriptions.sql`
- Modify: `apps/api/src/database/schema/business-members.ts` (quitar `businessPlansState`, agregar `subscriptions`)
- Test: `apps/api/src/database/security/subscriptions.db.spec.ts`

**Interfaces:**
- Produce: `public.subscriptions(id uuid primary key default gen_random_uuid(), business_id uuid references public.businesses(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, plan_code public.business_plan_code not null, started_at timestamptz not null default now(), cancelled_at timestamptz, deleted_at timestamptz, created_at, updated_at)` con `check ((business_id is not null) <> (user_id is not null))`; índice único parcial `subscriptions_live_business_key on (business_id) where business_id is not null and cancelled_at is null and deleted_at is null`; **sin FK al catálogo, a propósito**: un `cascade` haría que borrar un plan del catálogo devuelva a los negocios a `free` en silencio, y un `restrict` volvería inalcanzable la negativa ruidosa del motor cuando el enum va por delante del catálogo. El que se niega es el motor, y se niega en voz alta. Y `business_plan_of(uuid)` reescrita para leer de `subscriptions`, conservando el `coalesce` a `'free'` y su ACL (`{postgres, service_role}`, revocada de `public, anon, authenticated`).
- Produce: `business_plans_state` **eliminada**.

- [x] **Step 1: El test**

Cuatro casos sobre la base real: (a) un negocio sin fila se lee `free`; (b) con una
suscripción viva se lee su `plan_code`; (c) una fila con `cancelled_at` o
`deleted_at` no cuenta (vuelve a `free`); (d) una suscripción con `user_id` **no**
afecta a ningún negocio. Más dos invariantes: dos filas vivas del mismo negocio son
rechazadas por el índice único, y una fila con `business_id` y `user_id` a la vez
viola el check. Y `to_regclass('public.business_plans_state')` es `null`.

- [x] **Step 2: Correr y ver que falla**

Run: `cd apps/api && bun test src/database/security/subscriptions.db.spec.ts`
Expected: FAIL — `relation "public.subscriptions" does not exist`

- [x] **Step 3: La migración**

La tabla, el check, el índice y la reescritura de `business_plan_of`; después
`drop table public.business_plans_state` — **está vacía en producción** (medido el
2026-10-21: 0 filas, 16 negocios), así que no hay datos que migrar y el `drop` no
necesita backfill. La nota va en la migración para que quien la lea no sospeche una
pérdida.

- [x] **Step 4: Aplicar y verificar**

`apply_migration`, renombrar al versionado del servidor, `md5sum` contra el ledger.
Verificación `SELECT`-only: `business_plan_of` devuelve `free` para los 16 negocios
vivos, y `business_plans_state` ya no existe.

- [x] **Step 5: Actualizar drizzle y todos los lectores**

Quitar `businessPlansState` del schema y agregar `subscriptions`; regenerar
`apps/api/drizzle/`. El compilador y los specs listan cualquier lector que quede.

- [x] **Step 6: Correr y verificar**

Run: `cd apps/api && bun test src/database && bun run typecheck`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add supabase/migrations apps/api/src/database
git commit -m "feat(db): suscripciones con sujeto genérico"
```

---

### Task 4: Los límites y las features se leen del catálogo

**Files:**
- Create: `supabase/migrations/<version>_plan_limits_from_catalog.sql`
- Modify: `apps/api/src/database/security/plan-limits.db.spec.ts` (la assertion de los triggers)

**Interfaces:**
- Produce: `enforce_business_location_limit()` y `enforce_business_member_limit()` leyendo `subscription_plans.max_locations` / `.max_members`; `business_has_feature(uuid, business_feature)` leyendo `subscription_plan_features`. Los tres conservan nombre, firma, ACL (`business_has_feature` sigue concedida a `authenticated`) y **todos** sus mensajes y códigos (`R0001`, `detail = business=… plan=… limit=… current=…`).

- [x] **Step 1: La assertion que prueba que ya no hay segunda copia**

La assertion de los triggers deja de parsear `case v_plan`: ahora afirma que cada
`pg_proc.prosrc` **menciona** `subscription_plans` / `subscription_plan_features` y
que **no contiene** ningún literal de los límites del catálogo (para cada plan, el
número de `BUSINESS_PLAN_LIMITS[plan].members` y `.locations` no aparece como
literal suelto en el cuerpo). Es la prueba de que el número que se hace cumplir y
el número que se dice salen de la misma fila.

- [x] **Step 2: El caso del plan fuera del catálogo**

El `else` ruidoso sigue existiendo: con un plan que no está en el catálogo, el
trigger levanta excepción en vez de asumir "sin tope". El test lo provoca así:
dentro de su transacción —que hace rollback— borra la fila del catálogo de `pro`,
inserta una suscripción con `plan_code = 'pro'` y comprueba que el alta del
siguiente miembro levanta excepción. El `cascade` se lleva las features, y
`subscriptions.plan_code` es el enum, **no** una FK al catálogo: la suscripción
sobrevive sin catálogo, que es exactamente el estado que el motor tiene que saber
detectar. La excepción no es `R0001` — un catálogo incompleto es un error de
configuración y tiene que ser ruidoso.

- [x] **Step 3: Correr y ver que falla**

Run: `cd apps/api && bun test src/database/security/plan-limits.db.spec.ts`
Expected: FAIL — el trigger sigue con los números escritos

- [x] **Step 4: La migración**

Reescribir los tres cuerpos conservando **la letra** de los mensajes en español
(el API los reenvía tal cual al dueño, y `staff.service.ts:1534` parsea el
`detail`). La única prosa que cambia es la del `else`: ahora habla del catálogo.

- [x] **Step 5: Aplicar y verificar**

`apply_migration`, renombrar, `md5sum` contra el ledger. Y la medición que prueba
equivalencia de comportamiento: los dos topes de `free` siguen rechazando la
segunda sucursal y el tercer miembro con el mismo mensaje y el mismo `R0001`.

Y la medición que es el punto entero de esta tarea: **cambiar el tope en la tabla,
sin tocar el trigger**. En una transacción de test, subir el tope de `free` a 3
deja entrar al tercer miembro y rechaza al cuarto; bajar el de `pro` a 1 hace que
el mensaje diga 1. Si eso no pasa, el número que el motor hace cumplir y el que
dice en voz alta no salen de la misma fila, y la tarea no está hecha.

- [x] **Step 6: La suite de base entera, sin cambios de semántica**

Run: `cd apps/api && bun test src/database`
Expected: PASS — incluidos `business-members.rls.db.spec.ts` (141+ casos de RLS y
grandfathering) y `plan-limits.db.spec.ts`, sin haberlos tocado más que en la
assertion del Step 1.

- [x] **Step 7: Commit**

```bash
git add supabase/migrations apps/api/src/database
git commit -m "feat(db): los topes y las features se leen del catálogo"
```

---

### Task 5: La API — el catálogo y la suscripción

**Files:**
- Create: `apps/api/src/modules/subscriptions/subscriptions.module.ts`
- Create: `apps/api/src/modules/subscriptions/subscriptions.controller.ts`
- Create: `apps/api/src/modules/subscriptions/subscriptions.service.ts`
- Create: `apps/api/src/modules/subscriptions/subscriptions.repository.ts`
- Create: `apps/api/src/modules/subscriptions/subscriptions.mapper.ts`
- Test: `apps/api/src/modules/subscriptions/subscriptions.service.spec.ts`, `subscriptions.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: los DTOs de Task 1, las tablas de Tasks 2–3, `requireActor`-like del módulo de staff **no** se reusa: la pertenencia se resuelve con los predicados de `apps/api/src/database/business-membership.ts`.
- Produce tres rutas (prefijo global `api/v1`):
  - `GET /plans` → `SubscriptionPlanDto[]` — cualquier usuario autenticado; sólo planes `is_active`.
  - `GET /businesses/:businessId/subscription` → `BusinessSubscriptionDto` — dueño o gerente del negocio, o admin de plataforma; 403 con `'Ver el plan del negocio es del dueño o su gerente.'` en cualquier otro caso.
  - `PATCH /businesses/:businessId/subscription` → `BusinessSubscriptionDto` — **sólo** admin de plataforma (403 `'Asignar el plan de un negocio es de la plataforma.'`), cuerpo `UpdateBusinessSubscriptionDto`, actualiza la fila viva o inserta una nueva, y emite el evento de log estructurado `business_plan_changed` con `{ businessId, from, to, actorId }`.

- [x] **Step 1: El test del servicio**

`assign` sobre un negocio sin fila **inserta**; sobre uno con fila viva
**actualiza** y no deja dos vivas; la respuesta trae límites y features del
catálogo, no de la suscripción (la suscripción sólo dice **qué plan**, el catálogo
dice **qué incluye**); un `plan_code` inexistente o `is_active = false` → 422
`'Ese plan no existe.'`

- [x] **Step 2: El test de las puertas**

`GET` con `staff` → 403; con gerente → 200; con admin de plataforma → 200.
`PATCH` con dueño → 403; con admin → 200. Sin token → 401. Un negocio inexistente
→ 404 en las dos.

- [x] **Step 3: Correr y ver que fallan**

Run: `cd apps/api && bun test src/modules/subscriptions`
Expected: FAIL — `Cannot find module`

- [x] **Step 4: El repositorio y el servicio**

Drizzle sobre las tres tablas. La lectura de la suscripción y del catálogo se
resuelve en **una** consulta con `left join` al catálogo (el plan vive en la
suscripción; los límites y features, en el catálogo), y el mapper arma el DTO.
Cuando no hay fila, el DTO sale con `plan_code: 'free'` y `since: null` — la misma
respuesta que da `business_plan_of`, calculada igual, para que el panel y el motor
no puedan discrepar.

- [x] **Step 5: El controlador y el módulo**

Tres rutas con `@ApiTags('Subscriptions')`, `@ApiBearerAuth('bearer')`, DTOs zod
(patrón del módulo de staff: schema de commons → `ZodValidationPipe` → DTO).

- [x] **Step 6: Correr y verificar**

Run: `cd apps/api && bun test src/modules/subscriptions && bun run typecheck && bun run test`
Expected: PASS

- [x] **Step 7: Commit**

```bash
git add apps/api/src
git commit -m "feat(api): catálogo de planes y suscripción del negocio"
```

---

### Task 6: Admin — la pestaña Plan

**Files:**
- Create: `apps/admin/src/features/businesses/api/business-subscription.api.ts`
- Create: `apps/admin/src/features/businesses/queries/business-subscription.keys.ts`, `business-subscription.queries.ts`
- Create: `apps/admin/src/features/businesses/components/business-plan-tab.tsx`
- Create: `apps/admin/src/features/businesses/components/business-plan-change-dialog.tsx`
- Modify: `apps/admin/src/features/businesses/components/business-detail-drawer.tsx` (la pestaña `plan` que el Plan 4 dejó declarada)
- Modify: `apps/admin/src/lib/labels.ts` (`businessPlanLabel`, `businessPlanAudienceLabel`)
- Test: `apps/admin/src/features/businesses/components/__tests__/business-plan-tab.test.tsx`

**Interfaces:**
- Consumes: `businessesKeys` (las claves del negocio), `api.get/patch` (`@/lib/api/client`), `PageTabs`/`TabPanel`, `AlertDialog`, `notifyMutationError`.
- Produce: `businessSubscriptionApi = { get(businessId), update(businessId, body) }`; `businessSubscriptionKeys = { all: ["businesses","subscription"], detail: (id) => [...] }`; `useBusinessSubscription(id: string | null)`, `useUpdateBusinessSubscription(businessId)` (invalida la suscripción **y** el detalle del negocio); `BusinessPlanTab({ businessId })`.

- [x] **Step 1: El test de la pestaña**

Con un negocio sin suscripción se muestra "Gratis" y "sin suscripción registrada"
(no una fecha inventada); con `pro` se muestran plan, sucursales (5), miembros (20)
y las features traducidas ("Pagos", "Accesos de personal"); el cambio de plan abre
confirmación, emite el `PATCH` y el `422` del API se ve con el `requestId`.

- [x] **Step 2: Correr y ver que falla**

Run: `cd apps/admin && bun test --isolate src/features/businesses/components/__tests__/business-plan-tab.test.tsx`
Expected: FAIL — `Cannot find module`

- [x] **Step 3: La pestaña**

Bloques: plan actual, desde cuándo, qué incluye (límites + features del catálogo) y
el botón "Cambiar plan" (diálogo con los tres planes, límites a la vista). El
conteo **usado** contra el tope (sucursales y miembros) se muestra como texto, no
como acción: el admin no expulsa gente, sólo asigna plan.

- [x] **Step 4: La copia de la consecuencia**

El diálogo dice qué pasa al bajar de plan: **nada se corta**; el negocio deja de
poder crecer hasta que vuelva a estar por debajo del tope. Es la regla del §5.4 y
es lo que el admin necesita saber antes de confirmar.

- [x] **Step 5: Correr y verificar**

Run: `cd apps/admin && bun test --isolate src && bun run typecheck`
Expected: PASS

- [x] **Step 6: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): pestaña Plan con asignación manual"
```

---

## Cierre

- [x] `bun run typecheck && bun run test && bun run build` en la raíz, verdes. — **typecheck 6/6 y
      build 4/4**. `bun run test` sale 1 **sólo** por `apps/landing`: el test
      `organizationJsonLd > url y logo son absolutas y del dominio configurado` espera
      `https://role.app/` y recibe el `VITE_SITE_URL=http://localhost:3001` del `.env` local
      copiado —con `VITE_SITE_URL=https://role.app` el paquete da **177 pass / 0 fail**—, y la
      rama **no toca `apps/landing`** (`git diff 1902541..HEAD -- apps/landing` sale vacío).
      API **2996 pass / 0 fail**, admin **677/0**, móvil **1008/0**, commons 0 fallos.
- [x] `bunx turbo run test --force --continue` (el caché de turbo no incluye las env de las apps).
      — corrido con el caché apagado: los mismos números; el único rojo es el de `landing` por la
      env local, idéntico a la línea base.
- [x] Contra la base viva: los 16 negocios siguen leyéndose `free`; los dos topes de
      `free` siguen rechazando con `R0001` y el mismo mensaje; `business_plans_state`
      no existe; el catálogo tiene 3 filas y sus features. — **medido en la base viva después de
      aplicar las tres migraciones**: los **16** negocios leen `free`;
      `to_regclass('public.business_plans_state')` es `null`; el catálogo tiene sus **3** filas
      (`free` 1/2, `pro` 5/20, `pro_plus` `null`/`null`) y sus **6** features; y los dos topes de
      `free` rechazan con **`R0001`** y el mismo mensaje de siempre —«el plan free admite hasta 2
      miembros, no más» y «el plan free admite hasta 1 sucursal, no más»—, medido dentro de una
      transacción descartada.
- [x] Un `pro_plus` sin tope sigue sin tope (y "sin tope" no es cero). — los topes de `pro_plus`
      son `null` en la fila viva del catálogo; el motor distingue «fila con tope `null`» de «fila
      que no está» (`found`), y el panel pinta «sin tope» y nunca `0`
      (`businessPlanLimitLabel`, con test que lo afirma).
- [x] El registro de decisiones abiertas se actualiza con lo que este plan deja
      apuntado: precios, pasarela, facturación del SRI, planes de consumidor y la
      superficie móvil del plan. — **Ruling:** el registro es la propia sección «Fuera de este
      plan (decidido con el partner, 2026-10-21)» de este plan, que nombra las cinco cosas
      pendientes, más la lista de fuera de alcance del ADR-0013 (§B). No hay un fichero de
      «decisiones abiertas» en el repo —`docs/decisions/` son ADRs, no una lista—, y no se crea
      uno nuevo para este plan.
- [x] Plan cerrado en este documento (casillas marcadas con su evidencia). — **Merge
      fast-forward a `main`**: las seis tareas están implementadas y revisadas; la revisión
      amplia de rama dio verde con dos Importantes que la ola final cerró; las tres migraciones
      están aplicadas y selladas (`20261021163528`, `20261021172305`, `20261021182624`, con su
      `md5sum` igual al `md5(statements[1])` del ledger); y el registro de la ejecución, con cada
      ruling y cada menor diferido, está en
      `.superpowers/sdd/2026-10-21-generalized-subscriptions/progress.md`.
