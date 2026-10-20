# Plan 3 — Alcance por sucursal, transferencia de propiedad y retiro de `business_ownership`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la ubicación por sucursal sea una frontera de datos de verdad —para gerentes
y empleados, en lecturas y escrituras—, que un dueño pueda entregar su negocio a otro
acceso vivo en una sola operación, que un negocio inactivo libere a su dueño sin dejar un
huérfano, y que `business_ownership` y sus 19 policies se retiren de la base.

**Architecture:** La frontera es RLS y la base, no el servicio (ADR-0002), así que las tres
decisiones de este plan se implementan **en Postgres** y la API se vuelve *cliente* de la
misma pregunta: pide a la base lo que la base es la única que sabe, y no vuelve a
implementar la regla. La transferencia de propiedad es una función `security definer` que
mueve el dueño en una transacción; la liberación de un dueño es una segunda función; y el
alcance por sucursal se apoya en dos helpers nuevos que hoy no existen. `business_ownership`
se cae **al final**, después de que el móvil y los cinco lectores de la API estén migrados.

**Tech Stack:** Postgres 15 + RLS + `security definer` helpers (Supabase), Drizzle ORM,
NestJS 11, zod (`packages/commons`), Bun + `bun:test`, Turbo.

**Spec:** `docs/superpowers/specs/2026-10-13-business-staff-access-design.md` (§5.1, §5.2,
§5.4, §6.2, §8, §9.5, §10, §12) · `docs/decisions/ADR-0013-accesos-de-staff-por-sucursal.md`
(addendum §A) · `docs/superpowers/plans/2026-10-16-business-staff-access-api.md` (§«Lo que
Plan 3 hereda de este plan, ítem por ítem»).

---

## Global Constraints

- **Toda migración entra por `apply_migration`, nunca por `execute_sql` ni por el dashboard.**
  Después: leer la versión que asignó el servidor, renombrar el archivo a
  `<version>_<name>.sql`, y comprobar `md5sum <archivo> == md5(statements[1])` de la fila
  del ledger. Un archivo sellado **no se edita**: un defecto encontrado después de aplicar
  es una migración nueva (el patrón del repo, escrito en `supabase/migrations/README.md`).
- **El `rollback` del ledger no sirve como red:** las **151** filas de
  `supabase_migrations.schema_migrations` tienen `rollback = NULL` (medido 2026-10-21). La
  vuelta atrás de cada tarea de base es, por lo tanto, **una migración nueva que restaura el
  predicado anterior**, nunca una down-migration.
- **Cada tarea deja el árbol verde**: `bun run typecheck`, `bun run test`, `bun run build`.
  Si una tarea no puede, no es una tarea: es el final del plan.
- **Sin `Co-Authored-By`** en ningún commit. Commits convencionales.
- **La base es la frontera y el móvil escribe directo a Supabase** (ADR-0002): ninguna de
  las tres decisiones se puede resolver en la API, porque el móvil no pasa por la API para
  operar.
- **La API es cliente de la misma pregunta**, no una segunda implementación. Si una regla
  aparece en TypeScript y en SQL, eso es un bug de este plan.
- **No se agregan paquetes** en `packages/`; los contratos nuevos van en
  `packages/commons/src/business/`.
- **No se toca `profiles.app_role`** ni se agrega una segunda puerta de login.

---

## Review Focus

Las cinco condiciones que la especificación sugiere y que ninguna prueba va a cubrir sola,
la más peligrosa primero. Cada línea tiene su prueba en la tarea que es dueña del código.

1. **Un `manager` sin filas de alcance no administra nada** — ni una sucursal, ni un
   producto, ni un pedido, ni un acceso. Hoy `can_manage_location` le da el negocio entero
   (`when r.member_role in ('owner','manager') then true`, verificado en la base viva el
   2026-10-21). La prueba vive en la Task 1.
2. **Un negocio activo no puede quedar sin dueño vivo**, ni por una degradación suelta, ni
   por un borrado de cuenta, ni por una cascada. La prueba vive en la Task 3.
3. **La transferencia es atómica**: o el negocio tiene un dueño nuevo y el viejo es gerente,
   o no pasó nada. Un estado intermedio —el dueño viejo degradado y el nuevo todavía sin
   promover— es un negocio sin dueño y no puede quedar en disco. La prueba vive en la Task 3.
4. **Un negocio sin dueño no vuelve a la vida**: reactivarlo se niega mientras no tenga un
   dueño vivo, y la única puerta que se abre después es la del admin. La prueba vive en la
   Task 5.
5. **El que deja de ser dueño no pierde el negocio de un día para otro**: la transferencia
   le deja el alcance de todas las sucursales como `manager`, y un `manager` sin alcance no
   alcanza nada. La prueba vive en la Task 3.

---

## Las tres decisiones (del partner, 2026-10-21)

Estas son **requisitos**, no opciones. El plan las implementa y las escribe en el ADR.

### D1 — La transferencia de propiedad existe

- **Una operación de base, no dos llamadas de API**: el índice parcial
  `business_members_one_owner_per_business` admite un dueño vivo por negocio, y el trigger
  `20261020052915` niega la degradación.
- **Una función `security definer`**, ejecutable sólo por el servicio, que verifica que
  quien llama es el dueño vivo de ese negocio y que el receptor es un acceso vivo del mismo
  negocio.
- **El dueño saliente queda como `manager`** con el alcance de todas las sucursales del
  negocio, para que la transferencia no le borre el panel de un día para otro.
- **`business_ownership` queda coherente mientras exista**: la fila pasa a apuntar al dueño
  nuevo en la misma transacción. Si no, el dueño nuevo ve el negocio vacío en el móvil hasta
  que la tabla caiga.

### D2 — Un negocio inactivo libera a su dueño

- **"Liberado" = la membresía de dueño se archiva** (`deleted_at`), y la fila de
  `business_ownership` de ese negocio **se borra** (mientras la tabla exista): si queda,
  sigue nombrando a una persona que ya no está, que es el huérfano silencioso del ítem 7.
- **El negocio no se borra ni se reactiva**: conserva ofertas, pedidos, sucursales y
  horarios. Esto es una jubilación, no un borrado.
- **La liberación es explícita y sólo para un negocio inactivo.** Un negocio activo se
  entrega (D1), no se libera.
- **Un negocio sin dueño no se reactiva.** La base lo dice y lo cumple: reactivar exige un
  dueño vivo.
- **Quién reactiva**: el dueño, si lo hay; y si no lo hay, **la plataforma** (un
  `app_role = 'admin'`), devolviéndole el dueño primero. La puerta de API existe en este
  plan; **la pantalla de admin no** (queda fuera, con su razón, en «Fuera de este plan»).

### D3 — El alcance por sucursal es una frontera de datos

- **El dueño** alcanza todo el negocio, implícitamente.
- **Un `manager` o un `staff`** alcanzan exactamente la unión de las sucursales de sus filas
  vivas de `business_member_locations`. **Sin filas, no alcanzan nada.**
- **Aplica a lecturas y escrituras**, no sólo a escrituras.
- **Las operaciones sin dimensión de sucursal NO se acotan por ubicación** y se nombran una
  por una abajo.
- **No hay backfill**: medido, hay **0** membresías no-dueño y **0** filas de alcance en
  producción, así que no hay nada que rellenar y no se inventa un backfill.

---

## Lo que se midió antes de escribir (2026-10-21, base viva, sólo `SELECT`)

Cada número de este plan sale de acá o de un archivo. Si algo no se pudo verificar, dice
«sin verificar» y por qué.

| afirmación | consulta | resultado |
| --- | --- | --- |
| Los dueños de `business_members` | `select count(*) … from business_members` | **16** filas, **16** vivas, **16** `owner`, **16** `active` |
| Membresías no-dueño | `… where role <> 'owner' and deleted_at is null` | **0** |
| Gerentes / empleados | `… where role='manager'` / `role='staff'` | **0** / **0** |
| Filas de alcance | `select count(*) from business_member_locations` | **0** (vivas y total) |
| `business_ownership` | `select count(*), count(distinct owner_id)` | **16** filas, **11** dueños distintos |
| Negocios | `select count(*) …, count(*) filter (where is_active)` | **16** negocios, **14** activos, **2** inactivos |
| Dueños en negocios inactivos | owners ⋈ businesses `where not is_active` | **2** (de 16) |
| Dueños con sesión TTL 0 | `… where session_ttl_hours = 0` | **16** (y **0** con TTL distinto, **0** sellados) |
| Perfil de dueño sin membresía | `business_ownership` LEFT JOIN `business_members` | **0** |
| Membresía de dueño sin fila de propiedad | el cruce inverso | **0** |
| Policies que usan `can_manage_location` | `pg_policies` | **13** |
| Policies que usan `business_member_role` | `pg_policies` | **12** (una usa los dos) |
| Policies que usan `business_ownership` | `pg_policies` | **19**, en **12** tablas |
| Policies de `business_members` | `pg_policies` | **2** (`Members can view own membership`, `Owners and managers view business members`) |
| Policies de `business_member_locations` | `pg_policies` | **1** (`Owners and managers view member scope`) |
| `can_manage_location` da el negocio entero al gerente | `pg_proc.prosrc` | **sí**: `when r.member_role in ('owner', 'manager') then true` |
| `business_member_locations` sí tiene `deleted_at` | `pg_attribute` | `deleted_at timestamptz null` ✔ |
| `business_locations` **no** tiene `deleted_at` | `pg_attribute` | tiene `is_active boolean` |
| `business_hours`, `coupons`, `payouts` sin dimensión de sucursal | `pg_attribute` | sólo `business_id` |
| `offers`, `orders` con dimensión de sucursal | `pg_attribute` | `business_location_id` |
| `auth.uid()` lee `request.jwt.claims` | `pg_get_functiondef` | **sí** (y `request.jwt.claim.sub`) |
| Trigger del dueño | `pg_trigger` | `trg_enforce_owner_is_untouchable` (BEFORE UPDATE), `trg_enforce_owner_cannot_be_deleted` (BEFORE DELETE), `trg_enforce_member_limit` (BEFORE INSERT OR UPDATE) |
| La guarda de `DELETE` sólo mira al dueño **vivo** | `pg_proc.prosrc` de `enforce_owner_cannot_be_deleted` | `old.role <> 'owner' or old.deleted_at is not null → return old` |
| La degradación **consume cupo** de miembro | `pg_proc.prosrc` de `enforce_business_member_limit` | `v_agrega := … or (old.role = 'owner' …)` — el comentario del trigger dice que es para «el día de la transferencia» |
| Ledger | `supabase_migrations.schema_migrations` | **151** filas, última `20261020053935`; `rollback` **NULL** en las 151 |
| `md5` de los seis archivos de esta cadena | `md5sum` local vs `md5(statements[1])` | **6 de 6** coinciden |
| `business_member_session_expires_at` es la única cuenta de la expiración | `pg_proc.prosrc` | sí, `IMMUTABLE`, y `can_manage_location` + `business_member_session_valid` + `business_member_session_state` la llaman |

**La consecuencia que ordena todo el plan:** en producción **no hay ni un solo `manager` ni
un solo `staff`**. Los 16 accesos son dueños. Cambiar la regla de alcance no le cambia la
vida a nadie hoy, y por eso el cambio de RLS puede ir temprano sin arriesgar a un usuario
real.

---

## Las policies: el inventario completo, y cuáles cambian

El plan **no** presupone la lista de cuatro escrituras que trae el brief: se verificó
contra `pg_policies` y son trece las que usan `can_manage_location`.

### Las 13 que usan `can_manage_location` — **cambian de comportamiento** (el helper deja de darle el negocio entero al `manager`)

| # | tabla | policy | cmd | qué pasa |
| --- | --- | --- | --- | --- |
| 1 | `business_locations` | `Members can view business locations` | SELECT | el gerente ve sólo sus sucursales |
| 2 | `business_locations` | `Members can update business locations` | UPDATE | el gerente renombra sólo las suyas |
| 3 | `business_locations` | `Members can delete business locations` | DELETE | **no cambia**: exige `role='owner'` |
| 4 | `offers` | `Members can view own offers` | SELECT | el gerente ve sólo los productos de sus sucursales |
| 5 | `offers` | `Members can insert own offers` | INSERT | el gerente inserta sólo en las suyas |
| 6 | `offers` | `Members can update own offers` | UPDATE | idem |
| 7 | `offers` | `Members can delete own offers` | DELETE | idem |
| 8 | `offer_categories` | `Members can insert offer categories` | INSERT | vía `offers.business_location_id` |
| 9 | `offer_categories` | `Members can delete offer categories` | DELETE | idem |
| 10 | `orders` | `Members can view own orders` | SELECT | el gerente ve sólo los pedidos de sus sucursales |
| 11 | `order_events` | `Members can view own order events` | SELECT | vía `orders.business_location_id` |
| 12 | `payment_intents` | `Members can view own payment intents` | SELECT | vía `orders.business_location_id` |
| 13 | `profiles` | `Members can view their order customers` | SELECT | el gerente ve sólo los clientes de sus pedidos |

**Ninguna de las trece cambia de texto:** las trece leen `can_manage_location`, y lo que
cambia es lo que el helper contesta. Eso es la diferencia entre un plan con trece diffs y
uno con uno.

### Las 12 que usan `business_member_role` — **dos cambian de texto, diez se quedan de negocio entero**

| # | tabla | policy | cmd | qué pasa |
| --- | --- | --- | --- | --- |
| 14 | `business_members` | `Owners and managers view business members` | SELECT | **CAMBIA**: pasa a ser «el roster que alcanza», con `business_member_reaches_member` |
| 15 | `business_member_locations` | `Owners and managers view member scope` | SELECT | **CAMBIA**: pasa a ser «el alcance de los accesos que alcanza» |
| 16 | `businesses` | `Members can view business` | SELECT | **de negocio entero** — la fila del negocio no tiene dimensión de sucursal |
| 17 | `businesses` | `Members can update business` | UPDATE | **de negocio entero** — D3 lo nombra explícitamente |
| 18 | `business_hours` | `Members can manage business hours` | ALL | **de negocio entero** — `business_hours` sólo tiene `business_id` (medido) |
| 19 | `coupons` | `Members can manage coupons` | ALL | **de negocio entero** — `coupons` sólo tiene `business_id` (medido) |
| 20 | `business_locations` | `Members can insert business locations` | INSERT | **de negocio entero** — crear una sucursal no es «alcanzar» una sucursal: la fila que se crea no tiene alcance de nadie todavía |
| 21 | `business_notification_preferences` | `Members can view own notification preferences` | SELECT | **de negocio entero** |
| 22 | `business_notification_preferences` | `Members can insert own notification preferences` | INSERT | **de negocio entero** |
| 23 | `business_notification_preferences` | `Members can update own notification preferences` | UPDATE | **de negocio entero** |
| 24 | `payouts` | `Members can view own payouts` | SELECT | **de negocio entero** — `payouts` sólo tiene `business_id` (medido) |

**La asimetría que hay que decir en voz alta:** un `manager` **sin** filas de alcance no ve
ningún producto, ningún pedido y ninguna sucursal, y sin embargo sigue viendo el negocio,
sus horarios, sus cupones, sus payouts y sus preferencias de notificación. No es una
contradicción: es la regla de D3. El alcance por sucursal acota **las cosas que viven en una
sucursal**; lo que es del negocio entero sigue siendo del negocio entero. Y por eso el
plan nombra las diez operaciones de la lista, en vez de dejar que se lean del predicado.

**Y una que NO cambia, y hay que decir por qué:** el `UPDATE` de una sucursal sigue
concediéndose a quien la alcanza. Un `staff` con alcance sobre la sucursal A puede
renombrar A. El §9.3 del spec decidió que eso se recorta en la UI, no en RLS, y este plan no
reabre esa decisión: la regla de D3 dice qué **alcanza** un miembro, no qué puede hacer con
lo que alcanza.

**Y otra que NO cambia, y también hay que decir por qué:** `Anyone can view active business
locations` (roles `public`, `is_active = true`) deja leer las sucursales activas a
cualquiera. Un `staff` sigue leyendo las sucursales activas que **no** son de su alcance. El
§5.1 del spec ya lo dice; este plan no lo cambia y el texto no puede afirmar lo contrario.

### Las 19 que usan `business_ownership` — **se borran en la Task 10**

`business_hours` (1), `business_locations` (1), `business_notification_preferences` (3),
`businesses` (2), `coupons` (1), `offer_categories` (2), `offers` (4), `order_events` (1),
`orders` (1), `payment_intents` (1), `payouts` (1), `profiles` (1). Los nombres exactos están
escritos en `apps/api/src/database/security/business-members.rls.db.spec.ts:2348-2368` y esa
lista **es** el test que la Task 10 cambia de 19 a 0.

---

## Mapa de archivos

**Se crean**

| archivo | qué es |
| --- | --- |
| `supabase/migrations/<v>_member_scope_predicates.sql` | los dos helpers de alcance (Task 1) |
| `supabase/migrations/<v>_location_scope_in_policies.sql` | `can_manage_location` sin el gerente + las dos policies del roster (Task 2) |
| `supabase/migrations/<v>_ownership_transfer.sql` | la transferencia + el invariante diferido (Task 3) |
| `supabase/migrations/<v>_inactive_business_releases_owner.sql` | la liberación + la guarda de reactivación (Task 5) |
| `supabase/migrations/<v>_shared_session_promise.sql` | la combinación de «vencida» en SQL (Task 7) |
| `supabase/migrations/<v>_drop_business_ownership.sql` | las 19 policies + la tabla + el trigger (Task 10) |
| `apps/api/src/modules/staff/ownership.controller.ts` | `POST …/ownership/transfer` y `POST …/ownership/restore` |
| `apps/api/src/database/business-membership.spec.ts` | el guard de que TypeScript ya no tiene la combinación |
| `packages/commons/src/business/schemas/business-ownership.schema.ts` | los cuerpos de las dos rutas |

**Se modifican**

| archivo | qué cambia |
| --- | --- |
| `apps/api/src/modules/staff/staff.service.ts` | `reaches` y `assertWithinReach` preguntan a la base; `mapWriteError` conoce `R0004`; el actor admin |
| `apps/api/src/modules/staff/staff.repository.ts` | las dos llamadas nuevas a la base |
| `apps/api/src/modules/staff/staff.controller.ts` | el 422 de degradar dice «transferí la propiedad» |
| `apps/api/src/modules/staff/staff.module.ts` | registra el controlador nuevo |
| `apps/api/src/database/business-membership.ts` | `sessionInsidePromise` delega en SQL |
| `apps/api/src/modules/auth/auth-account.repository.ts` | la puerta del borrado cuenta sólo dueños de negocios activos; `anonymise` borra la fila de propiedad |
| `apps/api/src/modules/auth/auth.service.ts` | el 409 nombra la puerta que ahora existe |
| `apps/api/src/modules/businesses/businesses.repository.ts` | el join del agregado y el alta dejan `business_ownership` |
| `apps/api/src/modules/announcements/announcements.repository.ts` | `ownerIdsForBusinesses` lee membresías |
| `apps/api/src/modules/notifications/notification.handlers.ts` | la regla de presencia pasa a las membresías |
| `apps/mobile/src/features/business/data/repository.ts` | `getBusinessesByOwnerId` lee `business_members` |
| `apps/mobile/e2e/fixtures.ts` | el cuerpo del fixture |
| `apps/api/src/database/schema/business-companions.ts` | `businessOwnership` sale del espejo |
| `apps/api/src/database/security/business-members.rls.db.spec.ts` | la matriz de alcance, la transferencia, la liberación, el inventario de policies |
| `apps/api/src/database/security/businesses.rls.db.spec.ts` | el inventario de policies y la etiqueta del dueño |
| `apps/api/src/database/security/orders.rls.db.spec.ts` | idem |
| `docs/decisions/ADR-0013-accesos-de-staff-por-sucursal.md` | el addendum §B |

---

### Task 1: El alcance es una regla de la base, y la API la consulta

**Files:**
- Create: `supabase/migrations/<version>_member_scope_predicates.sql`
- Modify: `apps/api/src/modules/staff/staff.service.ts:90` (`scopeIsContained`), `:914-949` (`reaches`, `assertWithinReach`), `:843-890` (`requireActor`)
- Modify: `apps/api/src/modules/staff/staff.repository.ts`
- Test: `apps/api/src/database/security/business-members.rls.db.spec.ts`
- Test: `apps/api/src/modules/staff/staff.service.spec.ts`

**Interfaces:**
- Consumes: `business_members`, `business_member_locations`, `business_member_role`,
  `business_member_session_valid` (todo ya existe).
- Produce:
  - `public.business_member_reaches_member(p_business_id uuid, p_target_member_id uuid) → boolean`
    — `stable security definer set search_path = ''`. **ACL: `{postgres, service_role, authenticated}`**
    —o sea `revoke all on function … from public, anon` + `grant execute on function … to
    authenticated, service_role`—, porque **una policy la llama como el rol que la invoca**
    y sin el `grant` a `authenticated` la policy nueva no concede nada. Es el mismo ACL que
    tienen `can_manage_location` y `business_member_role` (medido en `pg_proc.proacl`).
    Regla, en una frase: **el dueño vivo del negocio alcanza a todos los accesos; cualquier
    otro miembro alcanza a un acceso si y sólo si su alcance es no vacío, el alcance del
    acceso es no vacío, y el del acceso está contenido en el suyo.** La sesión vencida niega
    (llama a `business_member_session_valid`).
  - `public.business_member_covers_locations(p_business_id uuid, p_location_ids uuid[]) → boolean`
    — misma forma, y **ACL: `{postgres, service_role}`** (o sea `revoke all … from public,
    anon, authenticated` + `grant execute … to service_role`): **sólo la API la llama**, no
    ninguna policy, así que `authenticated` no tiene por qué verla. Regla: **el dueño cubre
    todo; cualquier otro miembro cubre un conjunto no vacío de sucursales si todas están en
    su alcance, y un conjunto vacío no lo cubre nadie salvo el dueño.**
  - `StaffRepository.reachesMember(businessId, memberId): Promise<boolean>` y
    `StaffRepository.coversLocations(businessId, locationIds): Promise<boolean>` — las dos
    llaman a la base con `auth.uid()` del llamador declarado vía
    `set_config('request.jwt.claims', …, true)`, igual que `sessionStateAsCaller`
    (`staff.repository.ts:487-522`).

**Por qué esta tarea va primera y por qué no toca ninguna policy:** la regla del alcance
tiene que existir en un solo sitio antes de que nadie la escriba en dos. Esta tarea crea la
regla y le pregunta a la API; **no cambia ninguna policy**, así que el comportamiento de
producción no se mueve (y con 0 gerentes y 0 empleados en producción, no hay a quién
moverse). La Task 2 la pasa a las policies.

- [ ] **Step 1: Escribir los tests que fallan** (en
  `apps/api/src/database/security/business-members.rls.db.spec.ts`, un `describe` nuevo
  `el alcance por sucursal es una regla de la base`)

  Fijo: `BIZ_A` con `LOC_A` y `LOC_B`; un `M_MANAGER` con alcance `{LOC_A}`; un
  `M_MANAGER_SIN_ALCANCE` sin filas; un `M_STAFF_A` con alcance `{LOC_A}`; un `M_STAFF_B`
  con alcance `{LOC_B}`; un `M_STAFF_SIN_ALCANCE` sin filas. (Las dos filas de alcance
  distintas son las que separan «contenido» de «salido»: `M_STAFF_A` está contenido en
  `M_MANAGER` y `M_STAFF_B` no.)

  ```ts
  test('el dueño alcanza a todos los accesos del negocio, sin filas de alcance', …)
  // business_member_reaches_member(BIZ_A, M_STAFF_A) === true

  test('un gerente alcanza el acceso cuyo alcance está contenido en el suyo', …)
  // M_MANAGER={LOC_A}, M_STAFF_A={LOC_A} → true

  test('un gerente NO alcanza el acceso cuyo alcance sale del suyo', …)
  // M_MANAGER={LOC_A}, M_STAFF_B={LOC_B} → false

  test('un gerente sin filas de alcance no alcanza a nadie', …)
  // business_member_reaches_member(BIZ_A, M_STAFF_A) === false

  test('un acceso sin alcance sólo lo alcanza el dueño', …)
  // M_STAFF_SIN_ALCANCE: el gerente con alcance → false; el dueño → true

  test('un miembro sin filas de alcance no cubre ni una sucursal', …)
  // business_member_covers_locations(BIZ_A, [LOC_A]) === false

  test('un gerente cubre las sucursales de su alcance y ninguna más', …)

  test('el conjunto vacío de sucursales lo cubre sólo el dueño', …)
  // business_member_covers_locations(BIZ_A, []) === false para el gerente; true para el dueño

  test('una sesión vencida no alcanza nada', …)
  // el helper llama a business_member_session_valid: mismo reloj que las policies
  ```

  Y en `apps/api/src/modules/staff/staff.service.spec.ts`: **el caso que hoy no está
  testeado** (ítem 18 de la herencia): un `manager` **sin** alcance no puede crear ni editar
  un acceso sin alcance, y **no** puede tocar un acceso sin alcance.

- [ ] **Step 2: Correr y verificar que falla**

  Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
  Expected: FAIL — las dos funciones no existen todavía (`42883`).

- [ ] **Step 3: Escribir los dos helpers**

  Los dos son `security definer` con `search_path = ''` y el cuerpo calificado, como los
  siete que ya existen. Los dos leen el alcance del llamador con la misma forma
  (`business_member_locations` unido a `business_members` por `member_id`, filtrando
  `deleted_at is null` en las dos tablas) y **no** leen `business_member_locations` desde
  una policy (una policy que lee `business_member_locations` con la RLS del llamador
  recursaría: `business_members` → `business_member_locations` → `business_members`).

  La contención se calcula con `not exists (… del alcance del objetivo que no esté en el del
  llamador)`, no con `&&` de arrays: el operador `&&` sobre `uuid[]` existe, pero el predicado
  con `not exists` es el que el harness puede leer y el que la spec puede mutar.

- [ ] **Step 4: La API pregunta, y deja de decidir**

  En `staff.service.ts`:
  - `scopeIsContained` (`:90`) **se borra**: es la segunda implementación de la regla.
  - `reaches` (`:914`) deja de comparar alcances: la regla del `role='owner'` (un gerente
    nunca administra al dueño) la sigue aplicando el servicio, porque es una regla de
    producto del §8 y no una de ubicación; la **contención** la responde la base.
  - `assertWithinReach` (`:939`) llama a `business_member_covers_locations`.
  - `requireActor` (`:843`) deja de armar `locationIds`: el llamador no necesita su alcance
    para decidir nada, y `StaffActor.locationIds` desaparece.
  - `list` (`:153`) filtra el roster llamando a `reachesMember` **una vez por acceso**. **Es
    un costo consciente y hay que decirlo:** el roster está topado por plan —**2** accesos en
    `free`, **20** en `pro`, sin tope en `pro_plus`— así que el peor caso son veinte
    idas a la base. Una versión de una sola llamada (un helper que devuelva el conjunto de
    ids alcanzables) es una decisión de performance, y este plan no la toma: lo anota.

  En `staff.repository.ts`: los dos métodos nuevos, con el patrón de
  `sessionStateAsCaller` (`set_config('request.jwt.claims', …, true)` dentro de
  `db.transaction`, y el `::text` + `JSON.parse` no hace falta acá porque el retorno es
  booleano).

- [ ] **Step 5: Correr y verificar que pasa**

  Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts src/modules/staff/staff.service.spec.ts`
  Expected: PASS.

- [ ] **Step 6: Aplicar, sellar y commitear**

  ```bash
  # apply_migration(name: "member_scope_predicates", query: <el sql de la Task 1>)
  # leer la versión del ledger, renombrar el archivo, y comprobar:
  md5sum supabase/migrations/<version>_member_scope_predicates.sql
  # select md5(statements[1]) from supabase_migrations.schema_migrations where version = '<version>'
  git commit -am "feat(db): el alcance por sucursal es una regla de la base, y la API la consulta"
  ```

  **Vuelta atrás:** una migración nueva que `drop function` las dos y restaure el predicado
  de `staff.service.ts`. El `rollback` del ledger es `NULL` (medido), así que no hay otra
  red. La función nueva no cambia ninguna policy, así que el peor caso de una vuelta atrás
  es que la API vuelva a decidir en TypeScript.

---

### Task 2: La frontera de sucursal, en las policies

**Files:**
- Create: `supabase/migrations/<version>_location_scope_in_policies.sql`
- Test: `apps/api/src/database/security/business-members.rls.db.spec.ts`

**Interfaces:**
- Consumes: `can_manage_location`, `business_member_reaches_member` (Task 1).
- Produce: **15** policies que dependen del alcance —las **13** que usan
  `can_manage_location` y las **2** del roster—, de las cuales **14** cambian de
  comportamiento y **una no**: `Members can delete business locations`, que exige
  `role='owner'` y por lo tanto no le da alcance a nadie.

**Ésta es la tarea arriesgada y va temprano a propósito**: después de ella, todo lo demás
se construye sobre el alcance, no alrededor de él.

- [ ] **Step 1: Escribir los tests que fallan**

  En `business-members.rls.db.spec.ts`, un `describe` nuevo `la frontera de sucursal` con
  una matriz `(rol, sucursal) → puede leer / puede escribir` sobre `offers`, `orders`,
  `business_locations` y `business_members`:

  ```ts
  test('un gerente con alcance en A no lee los productos de B', …)
  test('un gerente con alcance en A no inserta un producto en B', …)
  test('un gerente con alcance en A no borra un producto de B', …)
  test('un gerente con alcance en A no lee los pedidos de B', …)
  test('un gerente con alcance en A no renombra la sucursal B', …)
  test('un gerente SIN alcance no lee ningún producto del negocio', …)
  test('un gerente SIN alcance no lee ninguna sucursal del negocio', …)
  test('el dueño lee y escribe el negocio entero', …)
  test('un empleado con alcance en A lee los productos de A y no los de B', …)
  test('un empleado SIN alcance no lee ningún producto', …)
  ```

  Y las dos policies del roster, que hoy son de negocio entero:

  ```ts
  test('un gerente no ve en el roster el alias de un acceso fuera de su alcance', …)
  test('un gerente no ve las filas de alcance de un acceso fuera de su alcance', …)
  test('el dueño ve el roster entero', …)
  ```

  Y las diez operaciones de negocio entero, para que nadie las acote por error:

  ```ts
  test('el negocio, los horarios, los cupones, los payouts y las preferencias siguen siendo del negocio entero', …)
  // el gerente SIN alcance sigue viendo y escribiendo todo eso
  ```

- [ ] **Step 2: Correr y verificar que falla**

  Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
  Expected: FAIL — el gerente ve el negocio entero.

- [ ] **Step 3: Cambiar el helper, no las trece policies**

  En `can_manage_location`, la rama `when r.member_role in ('owner', 'manager') then true`
  pasa a `when r.member_role = 'owner' then true`. **Las trece policies no se tocan**: lo
  que cambia es lo que el helper contesta, y por eso el diff de la migración es de un
  predicado y no de trece.

- [ ] **Step 4: Cambiar las dos policies del roster**

  - `Owners and managers view business members` → su `qual` pasa a
    `public.business_member_reaches_member(business_id, id) and deleted_at is null`.
    La llamada a `business_member_session_valid` desaparece de la policy porque la hace el
    helper (que es `security definer` y por lo tanto lee la fila sin la RLS del llamador).
  - `Owners and managers view member scope` → su `qual` pasa a
    `public.business_member_reaches_member(business_id, member_id) and deleted_at is null`.

  **Postgres no tiene `create or replace policy`:** reescribir una policy es
  `alter policy … using (…)` —que conserva el OID y no la saca nunca de `pg_policies`— o
  `drop policy` + `create policy`, que abre una ventana en la que la policy no existe. El
  plan exige **`alter policy`**, y por eso el diff de la migración es de dos `alter` y no de
  dos `drop` + dos `create`.

- [ ] **Step 5: Correr y verificar que pasa**

  Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
  Expected: PASS.

  Run: `bun run typecheck && bun run test && bun run build` — verde.

- [ ] **Step 6: Aplicar, sellar y commitear**

  ```bash
  git commit -am "feat(db): el gerente alcanza sólo sus sucursales, y el roster también"
  ```

  **Vuelta atrás:** una migración nueva que restaure el predicado viejo de
  `can_manage_location` (cambiar `'owner'` por `in ('owner','manager')`) y las dos policies
  del roster. Es una migración de dos líneas y un `alter policy`; el riesgo real de esta
  tarea no es reversible con una down-migration sino con **el commit**: por eso el paso 1
  escribe la matriz antes de que exista el cambio.

---

### Task 3: La transferencia de propiedad, en la base

**Files:**
- Create: `supabase/migrations/<version>_ownership_transfer.sql`
- Test: `apps/api/src/database/security/business-members.rls.db.spec.ts`

**Interfaces:**
- Consumes: `business_members`, `business_member_locations`, `business_ownership` (mientras
  exista), `business_locations`, el trigger `trg_enforce_owner_is_untouchable`.
- Produce:
  - `public.transfer_business_ownership(p_business_id uuid, p_new_owner_member_id uuid) → jsonb`
    — `volatile security definer set search_path = ''`, **ACL: `{postgres, service_role}`**
    (o sea `revoke all … from public, anon, authenticated`; el `grant` a `service_role` ya
    está en el `pg_default_acl` del proyecto, pero se escribe explícito). Devuelve
    `{ business_id, previous_owner_member_id, previous_owner_user_id, new_owner_member_id,
    new_owner_user_id }`.
  - `public.enforce_business_keeps_an_owner()` + `create constraint trigger
    trg_business_keeps_an_owner after update on public.business_members deferrable initially
    deferred for each row`.
  - `public.enforce_owner_is_untouchable()` reescrito.

**El invariante, en una frase, y es la misma regla que decide las tres cosas:**
> **Un negocio ACTIVO siempre tiene un dueño vivo. Un negocio INACTIVO puede no tenerlo.**

**Por qué es un trigger DIFERIDO y no un `BEFORE`:** la degradación y la promoción tienen
que pasar en **dos sentencias** (el índice parcial `business_members_one_owner_per_business`
comprueba fila por fila, así que en una sola sentencia el orden de las filas no está
garantido y la promoción puede chocar con `23505`). Con dos sentencias, un trigger
`BEFORE` vería el estado intermedio —el negocio sin dueño— y negaría una transferencia
legítima. Un `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` se evalúa **al commit**,
con el estado final: la transferencia pasa, y una degradación suelta de un negocio activo
se aborta al commit.

**Por qué el trigger `BEFORE` pierde la guarda de degradación y la de dar de baja, y las
gana el diferido:** las dos medían el estado de la fila —«¿esta fila sigue siendo la del
dueño?»—, y lo que decide si el negocio tiene dueño es el estado **final** de la
transacción. La guarda de `status → 'disabled'` **se queda** en el `BEFORE`, porque no es
una transferencia: es una revocación, y merece un error inmediato y con su mensaje.

- [ ] **Step 1: Escribir los tests que fallan**

  En `business-members.rls.db.spec.ts`, `describe` nuevo `la transferencia de propiedad`:

  ```ts
  test('la transferencia deja un dueño vivo y al anterior como gerente', …)
  // exactamente una fila role='owner' y deleted_at is null; el anterior, role='manager'

  test('el dueño saliente conserva el alcance de todas las sucursales del negocio', …)
  // business_member_locations tiene una fila por cada business_locations del negocio

  test('la transferencia deja business_ownership apuntando al dueño nuevo', …)
  // mientras la tabla exista: select owner_id from business_ownership where business_id = …

  test('sólo el dueño actual puede transferir', …)
  // como authenticated, con el manager: R0004

  test('el receptor tiene que ser un acceso vivo del mismo negocio', …)
  // un member_id de otro negocio → R0004; un member archivado → R0004; el propio dueño → R0004

  test('la transferencia es atómica: o pasa entera o no pasa', …)
  // una transferencia cuyo receptor no es válido deja al dueño viejo como dueño

  test('un negocio activo no puede quedar sin dueño', …)
  // update business_members set role='manager' sobre el dueño, en su propia transacción → aborta al commit con R0002

  test('un negocio inactivo puede quedar sin dueño', …)
  // el mismo update, con el negocio inactivo → la transacción se confirma
  ```

  **El fixture tiene que activar el negocio a mano, y en el orden correcto.**
  `default_business_inactive` es un trigger `BEFORE INSERT` que **fuerza**
  `new.is_active := false` (medido: `if new.is_active is distinct from false then
  new.is_active := false`), así que **un negocio insertado queda inactivo siempre**, ni
  siquiera con `is_active = true` en el `insert`. Y el invariante de esta tarea es
  exactamente sobre los negocios **activos**. El orden del fixture es, por lo tanto:
  **insertar el negocio (inactivo) → insertar la membresía de dueño → `update businesses
  set is_active = true`**. Sin ese `update` explícito, los tests del invariante no prueban
  nada y pasan por la razón equivocada. (A partir de la Task 5 ese `update` dispara la
  guarda de reactivación, así que el orden del fixture es **obligatorio**, no una
  recomendación.)

- [ ] **Step 2: Correr y verificar que falla**

  Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
  Expected: FAIL — la función no existe (`42883`) y la degradación sigue prohibida.

- [ ] **Step 3: Escribir la función y el trigger diferido**

  `transfer_business_ownership`, en este orden y en **una sola transacción** (una llamada a
  función llamada sola es su propia transacción; llamada dentro de la transacción de la API,
  es parte de ella):

  1. `v_caller := auth.uid()`; si es `null` → `R0004`, «la transferencia necesita un
     llamador verificado».
  2. El llamador tiene que ser el **dueño vivo** de ese negocio (`role='owner'`,
     `status='active'`, `deleted_at is null`) → si no, `R0004`.
  3. El receptor tiene que ser un acceso **vivo** de ese negocio, y no el propio dueño →
     si no, `R0004`.
  4. **Degradar** al dueño actual a `manager` (`update … set role='manager', updated_at=now()`).
  5. **Dar** el alcance de todas las sucursales del negocio al dueño saliente
     (`insert into business_member_locations … select … from business_locations where
     business_id = …`, `on conflict do nothing`).
  6. **Promover** al receptor a `owner`.
  7. **Coherencia con `business_ownership`**: `insert into public.business_ownership
     (business_id, owner_id) values (…, …) on conflict (business_id) do update set owner_id =
     excluded.owner_id, updated_at = now()`. **Upsert y no update**: un negocio sin fila de
     propiedad es un negocio que el móvil no leía, y después de la transferencia tiene que
     leerse igual que los demás — la fila tiene que **apuntar** al dueño nuevo, exista o no
     existiera.
  8. Devolver el `jsonb` de los cinco identificadores.

  **El paso 4 puede ser rechazado por el tope de plan**: `enforce_business_member_limit`
  cuenta la degradación como crecimiento (`old.role = 'owner'` → `v_agrega`), así que un
  negocio en su tope de miembros **no puede transferir** hasta que libere una plaza o suba
  de plan. Eso es la aritmética que el trigger ya tenía escrita y que su propio comentario
  dice que existe «para el día de la transferencia». El error es `R0001` y la API lo traduce
  con el mensaje del plan (Task 4). **El plan lo dice en voz alta: la transferencia puede
  fallar por el tope, y no es un bug.**

  `enforce_business_keeps_an_owner`, el trigger diferido:

  ```sql
  -- El invariante se mira AL COMMIT, con el estado final.
  -- «Un negocio activo tiene un dueño vivo»: si la transacción termina y el
  -- negocio sigue activo y sin dueño, se aborta.
  ```

  `enforce_owner_is_untouchable`, reescrito: conserva la guarda de `status → 'disabled'`
  (`R0002`, con su mensaje) y **quita** las guardas de degradación y de `deleted_at`, que
  pasan a ser cosa del trigger diferido. El `trg_enforce_owner_cannot_be_deleted` (BEFORE
  DELETE) **no se toca**: ya acepta borrar un dueño archivado, que es lo que hace posible
  borrar el negocio después de una liberación.

- [ ] **Step 4: Correr y verificar que pasa**

  Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts`
  Expected: PASS.

  **Ojo con el harness, y es una diferencia que cambia cómo se escribe el test:** el trigger
  diferido se dispara **al commit**, no en la sentencia. `as()` abre la transacción, corre el
  callback y **commitea dentro de `as()`** (`apps/api/test/supabase-platform.ts:1585`), así que
  el error del commit propagado sale por `as()` y `deniedAs()` lo captura: el test del
  «negocio activo no puede quedar sin dueño» se escribe con `deniedAs` **igual que los
  demás**, y lo que se afirma es que la **sentencia** pasó y el **commit** no. Un test que
  afirma que la sentencia falló estaría probando otra cosa.

- [ ] **Step 5: Aplicar, sellar y commitear**

  ```bash
  git commit -am "feat(db): la transferencia de propiedad es una operación, y un negocio activo tiene dueño"
  ```

  **Vuelta atrás:** dos migraciones, o una. La de las funciones es un `drop function`. La del
  trigger diferido es un `drop constraint trigger` + reponer el predicado viejo de
  `enforce_owner_is_untouchable` (que es texto, y está en el archivo sellado
  `20261020052915_owner_cannot_be_demoted.sql`, líneas 63-117 — **copiado, no editado**).
  Con el trigger diferido caído, la degradación vuelve a estar prohibida y el sistema queda
  como antes de esta tarea, que es un estado coherente.

---

### Task 4: La transferencia, por HTTP

**Files:**
- Create: `packages/commons/src/business/schemas/business-ownership.schema.ts`
- Create: `apps/api/src/modules/staff/ownership.controller.ts`
- Modify: `apps/api/src/modules/staff/staff.service.ts` (`mapWriteError`, `:1140`; y el 422 de
  degradar, `:439-443`)
- Modify: `apps/api/src/modules/staff/staff.module.ts` (registrar el controlador)
- Modify: `apps/api/src/modules/staff/staff.controller.ts` (la descripción Swagger del 422, si
  la nombra)
- Test: `apps/api/src/modules/staff/staff.service.spec.ts`, `staff.controller.spec.ts`

**Interfaces:**
- Consumes: `transfer_business_ownership` (Task 3).
- Produce:
  - `POST /businesses/:businessId/ownership/transfer`, cuerpo
    `{ new_owner_member_id: uuid }`, respuesta
    `{ previous_owner: BusinessMemberDto, new_owner: BusinessMemberDto }`.
  - El código de error nuevo **`R0004`** («la transferencia o la liberación se negaron»),
    mapeado a **422** con el mensaje de la base. Se elige `R0004` y no `R0003` porque `R0003`
    es el que el ítem 9 de la herencia reserva para separar la *entitlement* del tope de plan
    —una decisión que este plan **no** toma (ver la auditoría de herencia)— y porque `R0001`
    ya significa dos cosas (el tope y la entitlement) y no puede absorber una tercera sin
    que el panel tenga que parsear el `detail` para distinguirla.

- [ ] **Step 1: Escribir los tests que fallan**

  En `staff.service.spec.ts` y en `staff.controller.spec.ts`:

  ```ts
  test('el dueño transfiere la propiedad y los dos quedan con su rol nuevo', …)
  test('un gerente no puede transferir la propiedad', …)          // 403
  test('un R0004 de la base se traduce a un 422 con el motivo', …) // 422, no 500
  test('la transferencia no devuelve el PIN de nadie', …)          // la respuesta son dos DTOs, sin PIN
  ```

  Y en `staff.service.spec.ts`, el cambio del 422 de degradar: el mensaje actual dice
  «la transferencia de propiedad no existe en esta versión» (`staff.service.ts:439-443`), y
  después de esta tarea **ya existe**. El texto nuevo nombra la puerta que sí abre.

- [ ] **Step 2: Correr y verificar que falla**

  Run: `cd apps/api && bun test --isolate src/modules/staff/staff.service.spec.ts src/modules/staff/staff.controller.spec.ts`
  Expected: FAIL — la ruta no existe.

- [ ] **Step 3: Los contratos, el servicio y el controlador**

  - `packages/commons/src/business/schemas/business-ownership.schema.ts`:
    `TransferBusinessOwnershipSchema = z.strictObject({ new_owner_member_id: UuidSchema })`
    —`UuidSchema` es el validador que ya vive en
    `packages/commons/src/_common/schemas/common.ts`— y el tipo del DTO de respuesta.
  - `StaffService.transferOwnership(user, businessId, body)`: exige `role === 'owner'` de la
    **membresía viva** del negocio (no el `role` de plataforma), llama a la función de la
    base dentro de una transacción con `request.jwt.claims` declarado (el mismo patrón que
    `sessionStateAsCaller`), y devuelve los dos DTOs con `StaffMapper.toMemberDto`.
  - `mapWriteError`: el caso `R0004` → `UnprocessableEntityException` con el `message` de la
    base. El `message` de la base es la prosa que el dueño lee; no se reescribe.
  - `ownership.controller.ts`: `@Controller('businesses/:businessId/ownership')`, un
    `@Post('transfer')`. Sin `@Roles`: la puerta es la membresía, como en las otras ocho.

- [ ] **Step 4: Correr y verificar que pasa**

  Run: `cd apps/api && bun test --isolate src/modules/staff/staff.service.spec.ts src/modules/staff/staff.controller.spec.ts`
  Expected: PASS.

  Run: `bun run typecheck && bun run test && bun run build` — verde.

- [ ] **Step 5: Commitear**

  ```bash
  git commit -am "feat(api): la propiedad se transfiere, y el dueño que se va ya no queda atrapado"
  ```

  **Vuelta atrás:** esta tarea no toca la base, así que su vuelta atrás es el revert del
  commit. La función de la Task 3 se queda (no estorba a nadie: nadie la llama).

---

### Task 5: Un negocio inactivo libera a su dueño

**Files:**
- Create: `supabase/migrations/<version>_inactive_business_releases_owner.sql`
- Modify: `apps/api/src/modules/auth/auth-account.repository.ts` (`countRetained:99-134`,
  `anonymise:237-281`, `eraseAccount:319-341`)
- Modify: `apps/api/src/modules/auth/auth.service.ts` (`deleteAccount:691-746`)
- Test: `apps/api/src/modules/auth/auth.service.db.spec.ts`, `auth.service.spec.ts`
- Test: `apps/api/src/database/security/business-members.rls.db.spec.ts`

**Interfaces:**
- Consumes: `businesses.is_active`, `business_members`, `business_ownership`.
- Produce:
  - `public.release_business_ownership(p_business_id uuid, p_actor_user_id uuid) → jsonb`
    — `volatile security definer set search_path = ''`, **ACL: `{postgres, service_role}`**
    (o sea `revoke all … from public, anon, authenticated`). Niega con `R0004` si el negocio
    está **activo** («un negocio activo no libera a su dueño: transferí la propiedad») o si
    el actor no es su dueño vivo. Archiva la membresía de dueño (`deleted_at = now()`) y borra
    la fila de `business_ownership` de ese negocio. Devuelve
    `{ business_id, released_member_id, released_user_id }`.
  - `public.enforce_business_reactivation_needs_owner()` + `create trigger
    trg_business_reactivation_needs_owner before update of is_active on public.businesses for
    each row` — niega con `R0002` si `new.is_active` y el negocio no tiene un dueño vivo.

**La regla de D2, en el orden en que se implementa:**

1. **La puerta del borrado de cuenta cuenta sólo dueños de negocios ACTIVOS.**
   `countRetained` pasa a contar `owner_memberships` como las membresías de dueño vivas
   **de negocios activos**. Los dos dueños de negocios inactivos dejan de bloquear el
   borrado de su cuenta. Es el ítem 6 de la herencia, y es la mitad del ítem 7.
2. **El borrado de cuenta no deja a nadie apuntando a una persona que se va.** `anonymise`
   borra la fila de `business_ownership` de los negocios **inactivos** que la persona
   poseía, antes de archivar sus membresías. Sin esto, el negocio queda con una fila de
   propiedad que nombra a un perfil recién anonimizado: es exactamente el huérfano silencioso
   que el ítem 7 describe, y hoy no hay ninguno (medido: 0) pero el camino existe.
3. **`anonymise` archiva también las filas de alcance** de la membresía (ítem 14 de la
   herencia: hoy archiva la membresía y no sus `business_member_locations`, y las dos tablas
   discrepan sobre qué significa `deleted_at`).
4. **`eraseAccount` no deja que la cascada destruya una membresía** (ítem 13 de la herencia):
   antes de borrar el perfil, archiva las membresías vivas del usuario. Hoy no hay un
   llamador que lo haga sin la puerta, así que es defensa en profundidad.
5. **La base no deja reactivar un negocio sin dueño.** El trigger de `businesses` lo dice en
   el commit de la escritura, que es donde se puede saber si el negocio tiene dueño.
   **Y el orden importa en el fixture**: `default_business_inactive` fuerza `is_active =
   false` en **todo** insert (medido: `if new.is_active is distinct from false then
   new.is_active := false`), así que para tener un negocio activo hay que insertarlo y
   después `update businesses set is_active = true` — y ese `update` dispara la guarda, que
   exige que el dueño **ya exista**. El orden del fixture es: negocio → membresía de dueño →
   activar.

   **Y esto toca la moderación.** `apply_business_verification_state` hace
   `update public.businesses set is_active = (new.verification_status = 'approved')`, o sea
   que **aprobar** un negocio sin dueño vivo ahora **aborta la aprobación**. Es la
   consecuencia buscada («un negocio sin dueño no vuelve a la vida») y hay que decirla en voz
   alta: la moderación deja de poder publicar un negocio al que se le fue el dueño, y la
   puerta de salida es la de la Task 6.

**Sobre el backfill del ítem 7:** el plan 2 dijo «Plan 3 lo cierra con un backfill». **No hay
backfill, y hay que decirlo con el número:** medido el 2026-10-21, hay **0** filas de
`business_ownership` sin membresía de dueño y **0** membresías de dueño sin fila de
propiedad. No hay nada que rellenar. Lo que se cierra es el **camino**, con los puntos 1 y 2.

- [ ] **Step 1: Escribir los tests que fallan**

  En `auth.service.db.spec.ts` (el que corre contra el espejo con los triggers del ledger
  instalados *verbatim*):

  ```ts
  test('el dueño de un negocio inactivo sí puede borrar su cuenta', …)
  // owner_memberships === 0 para un dueño de un negocio inactivo; y > 0 para uno de un negocio activo

  test('al borrar la cuenta, la fila de propiedad del negocio inactivo se borra', …)
  // select count(*) from business_ownership where business_id = … → 0

  test('al borrar la cuenta, las filas de alcance quedan archivadas', …)
  // business_member_locations.deleted_at is not null

  test('la cascada no destruye una membresía viva', …)
  // eraseAccount con una membresía viva: la fila queda, archivada
  ```

  Y en `business-members.rls.db.spec.ts`:

  ```ts
  test('un negocio sin dueño no se reactiva', …)
  test('un negocio con dueño se reactiva', …)
  test('la liberación de un negocio activo se niega', …)
  test('la liberación archiva la membresía y borra la fila de propiedad', …)
  ```

- [ ] **Step 2: Correr y verificar que falla**

  Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts src/modules/auth/auth.service.db.spec.ts`
  Expected: FAIL — la función no existe y la puerta cuenta los dueños de negocios inactivos.

- [ ] **Step 3: La base**

  `release_business_ownership` y el trigger de reactivación, según las interfaces de arriba.
  La función **no** reactiva el negocio: no lo toca.

- [ ] **Step 4: La API**

  - `countRetained`: el conteo de `owner_memberships` se hace contra las membresías de dueño
    **vivas** (`role='owner'`, `deleted_at is null`) **de negocios activos**
    (`join businesses on businesses.id = business_members.business_id and businesses.is_active`).
    Los demás contadores no se tocan.
  - `anonymise`: antes de archivar las membresías, borra las filas de `business_ownership` de
    los negocios **inactivos** de los que la persona es dueño; y archiva también las filas de
    `business_member_locations` de sus membresías.
  - `eraseAccount`: archiva las membresías vivas del usuario antes de borrar el perfil.
  - `auth.service.ts`: el 409 de `deleteAccount` **cambia de texto**. Hoy dice «no route in
    this version does that: an owner cannot be demoted, given up or deleted, and ownership
    cannot be transferred» (`auth.service.ts:704-708`) — dos de esas tres frases dejan de
    ser verdad. Después de esta tarea la frase tiene que decir la verdad nueva: un dueño de
    un negocio **activo** no puede borrar su cuenta porque primero tiene que entregar el
    negocio, y la puerta para eso es `POST /businesses/:id/ownership/transfer`; y un dueño de
    un negocio **inactivo** ya puede borrarla sin más. **Un 409 que manda a una puerta que
    rebota es peor que uno que no da ninguna** (el ADR-0013 lo dice): el mensaje nombra la
    ruta que existe.

- [ ] **Step 5: Correr y verificar que pasa**

  Run: `cd apps/api && bun test --isolate src/database/security/business-members.rls.db.spec.ts src/modules/auth/auth.service.db.spec.ts src/modules/auth/auth.service.spec.ts`
  Expected: PASS.

  Run: `bun run typecheck && bun run test && bun run build` — verde.

- [ ] **Step 6: Aplicar, sellar y commitear**

  ```bash
  git commit -am "feat(db,api): un negocio inactivo libera a su dueño, y el borrado de cuenta no lo deja huérfano"
  ```

  **Vuelta atrás:** la migración nueva restaura el conteo viejo de `owner_memberships` (que
  es una línea de SQL) y borra la función y el trigger; el revert del commit restaura
  `anonymise` y `eraseAccount`. La tabla: un dueño de un negocio inactivo vuelve a estar
  bloqueado, que es el estado de hoy.

---

### Task 6: La recuperación — el admin devuelve el dueño a un negocio sin dueño

**Files:**
- Create: `supabase/migrations/<version>_assign_business_ownership.sql`
- Modify: `apps/api/src/modules/staff/ownership.controller.ts` (la segunda ruta)
- Modify: `apps/api/src/modules/staff/staff.service.ts` (la rama de admin)
- Modify: `packages/commons/src/business/schemas/business-ownership.schema.ts`
- Test: `apps/api/src/modules/staff/staff.service.spec.ts`, `staff.controller.spec.ts`
- Test: `apps/api/src/database/security/business-members.rls.db.spec.ts`

**Interfaces:**
- Consumes: `business_members`, `business_ownership` (mientras exista).
- Produce:
  - `public.assign_business_ownership(p_business_id uuid, p_member_id uuid) → jsonb`
    — `volatile security definer set search_path = ''`, **ACL: `{postgres, service_role}`**
    (o sea `revoke all … from public, anon, authenticated`). Niega con `R0004` si el negocio
    **ya tiene** un dueño vivo («usá la transferencia») o si el miembro no es un acceso
    vivo de ese negocio. Promueve al miembro a `owner` y deja `business_ownership`
    coherente (inserta la fila si falta, con `on conflict (business_id) do update`).
  - `POST /businesses/:businessId/ownership/restore`, cuerpo `{ member_id: uuid }`,
    **admin-only** (`user.role === 'admin'`, el `app_role` de plataforma).

**Por qué una segunda función y no la misma con un flag:** `transfer_business_ownership`
exige que quien llama **sea** el dueño; un negocio sin dueño no tiene a nadie que lo sea.
Son dos hechos distintos y dos permisos distintos: el primero es el dueño que entrega, el
segundo es la plataforma que rescata. **Un flag en la misma función sería un interruptor
para saltarse la primera regla.**

**Y por qué el admin necesita poder crear el acceso:** un negocio cuyo dueño se fue puede
quedarse sin ningún acceso. La recuperación son dos pasos y las dos puertas existen:
`POST /businesses/:id/staff` (crear el acceso) y `POST /businesses/:id/ownership/restore`
(darle el nombre). La primera gana una rama **admin**, y la rama es estrecha: **un admin
puede crear un acceso en un negocio que NO tiene dueño vivo, y en ningún otro negocio**.

**Y dónde vive esa rama:** `requireActor` (`staff.service.ts:843-847`) **sigue negando al
admin**, y la rama de admin vive **en `create`**, no en la puerta común. Si viviera en
`requireActor`, el admin podría administrar cualquier negocio sin dueño —y en cualquier
negocio con dueño, que es lo que hoy se le niega a propósito (ítem 11 de la herencia). La
comprobación es doble: `user.role === 'admin'` **y** el negocio no tiene dueño vivo.

- [ ] **Step 1: Escribir los tests que fallan**

  ```ts
  test('el admin puede darle el dueño a un negocio sin dueño', …)
  test('el admin NO puede darle el dueño a un negocio que ya tiene dueño', …)   // R0004
  test('el admin puede crear un acceso en un negocio sin dueño', …)
  test('el admin NO puede crear un acceso en un negocio con dueño', …)          // 403
  test('un dueño no puede usar la ruta de recuperación', …)                     // 403
  ```

- [ ] **Step 2: Correr y verificar que falla**

  Run: `cd apps/api && bun test --isolate src/modules/staff/staff.service.spec.ts`
  Expected: FAIL — la ruta no existe.

- [ ] **Step 3: La base, el servicio y el controlador**

  según las interfaces de arriba. La rama de admin del alta reutiliza **todo** el camino
  que ya existe (`createUser` + membresía + tarjeta de entrega con el PIN): no hay un
  segundo camino de alta, hay una segunda **puerta** al mismo camino.

- [ ] **Step 4: Correr y verificar que pasa**

  Run: `cd apps/api && bun test --isolate src/modules/staff/staff.service.spec.ts src/modules/staff/staff.controller.spec.ts src/database/security/business-members.rls.db.spec.ts`
  Expected: PASS.

  Run: `bun run typecheck && bun run test && bun run build` — verde.

- [ ] **Step 5: Aplicar, sellar y commitear**

  ```bash
  git commit -am "feat(api,db): la plataforma le devuelve el dueño a un negocio que se quedó sin él"
  ```

  **Vuelta atrás:** `drop function public.assign_business_ownership` y el revert del
  commit. La rama de admin del alta se quita con el revert; nada de la base queda colgado.

---

### Task 7: La combinación de «vencida» sale de TypeScript

**Files:**
- Create: `supabase/migrations/<version>_shared_session_promise.sql`
- Modify: `apps/api/src/database/business-membership.ts:87-98` (`sessionInsidePromise`)
- Create: `apps/api/src/database/business-membership.spec.ts` (el guard del lado de TypeScript)
- Modify: `apps/api/src/database/security/business-members.rls.db.spec.ts` (el guard del lado
  de SQL, **al lado del guard hermano que ya existe** en `:1380-1470`, que es el que
  comprueba que la **aritmética** de la expiración vive en una sola función)

**Interfaces:**
- Consumes: `business_member_session_expires_at` (ya existe, `IMMUTABLE`).
- Produce: `public.business_member_session_inside_promise(p_session_ttl_hours integer,
  p_last_authenticated_at timestamptz) → boolean` — `stable`, cuerpo calificado, sin
  `security definer` (no lee tablas), **ACL: `{postgres, service_role, authenticated}`**, igual
  que su hermana `business_member_session_expires_at`. **El `authenticated` no filtra nada**:
  la función recibe el TTL y el sello **del llamador** y no lee ninguna fila, así que contesta
  sobre lo que le pasaron, no sobre el estado de nadie. Es la **combinación** de las dos
  mitades de «vencida»: TTL apagado **o** (sello presente **y** la fecha compartida no pasó).

**Por qué `STABLE` y no `IMMUTABLE`:** la función compara contra `now()`, y `now()` es
`STABLE`. La aritmética (`business_member_session_expires_at`) sigue siendo `IMMUTABLE`, que
es donde tiene que estar.

- [ ] **Step 1: Escribir los tests que fallan**

  En `business-members.rls.db.spec.ts`, **al lado del guard hermano** que ya comprueba la
  aritmética (`:1380-1470`):

  ```ts
  test('la combinación de «vencida» vive una sola vez', …)
  // pg_proc: business_member_session_valid y can_manage_location
  //   → referencian business_member_session_inside_promise
  //   → y ninguno de los dos cuerpos contiene la combinación escrita a mano

  test('las cuatro mitades de la promesa', …)
  // ttl=0 → dentro; ttl>0 con sello fresco → dentro; ttl>0 con sello vencido → fuera;
  // ttl>0 sin sello → fuera
  ```

  Y en el spec nuevo `apps/api/src/database/business-membership.spec.ts` (unitario, sin
  base):

  ```ts
  test('el módulo de membresía no reescribe la combinación', …)
  // el SQL que genera liveMembership() nombra public.business_member_session_inside_promise
  // y NO contiene `interval`
  ```

- [ ] **Step 2: Correr y verificar que falla**

  Run: `cd apps/api && bun test --isolate src/database/business-membership.spec.ts`
  Expected: FAIL — el módulo de TypeScript todavía escribe la combinación.

- [ ] **Step 3: La función SQL y el módulo de TypeScript**

  - La función nueva, y `business_member_session_valid` + `can_manage_location` la llaman.
  - `sessionInsidePromise()` en `business-membership.ts` pasa a ser el fragmento que llama a
    la función de SQL. **El predicado sigue filtrando lo mismo** (mismo
    `ttl = 0 OR (sello AND no vencido)`), así que `membershipRole`, `ownerMembership` y
    `ownedBusinessIds` no cambian de comportamiento: lo que cambia es que la combinación ya
    no está escrita dos veces.

- [ ] **Step 4: Correr y verificar que pasa**

  Run: `cd apps/api && bun test --isolate src/database/business-membership.spec.ts src/database/security/business-members.rls.db.spec.ts`
  Expected: PASS.

  Run: `bun run typecheck && bun run test && bun run build` — verde.

- [ ] **Step 5: Aplicar, sellar y commitear**

  ```bash
  git commit -am "refactor(db,api): la promesa de sesión vive en SQL y no en dos lugares"
  ```

  **Vuelta atrás:** la función nueva se puede `drop` y los tres cuerpos se restauran con una
  migración que los vuelva a escribir (el texto está en los archivos sellados
  `20261015031154_shared_ttl_expiry_accounting.sql` y `20261015024825_business_policy_tightening.sql`,
  **copiado, no editado**).

---

### Task 8: El móvil lee el modelo de membresías

**Files:**
- Modify: `apps/mobile/src/features/business/data/repository.ts:352-376`
  (`getBusinessesByOwnerId`)
- Modify: `apps/mobile/e2e/fixtures.ts:1032-1059` (`businessBodies`)
- Test: `apps/mobile/e2e/07-business-management.spec.ts`, el spec del repositorio del móvil

**Interfaces:**
- Consumes: `business_members` (la policy `Members can view own membership` y la del roster).
- Produce: `getBusinessesByOwnerId(ownerId)` sin cambios de firma: sigue recibiendo el id del
  dueño y devuelve `Business[]`. **Cambia de dónde lee.**

**Por qué esta tarea va antes del drop y no después:** es la primera lectura que hace el
panel del dueño (`useBusinesses`, `apps/mobile/src/features/business/hooks.ts:25-31`), y sin
ella el `drop table` apaga el panel de todos los dueños.

- [ ] **Step 1: Escribir los tests que fallan**

  En el spec del repositorio del móvil y en `apps/mobile/e2e/07-business-management.spec.ts`:

  ```ts
  test('los negocios del dueño salen de sus membresías de dueño, no de business_ownership', …)
  // el mock de PostgREST ve una consulta a business_members con role=owner
  // y NO ve ninguna consulta a business_ownership
  ```

  El e2e tiene que cambiar su cuerpo de red: `businessBodies` sirve
  `business_ownership: [{ business_id: BUSINESS_ID }]`, y pasa a servir
  `business_members: [{ business_id: BUSINESS_ID, role: 'owner', status: 'active', deleted_at: null }]`.

- [ ] **Step 2: Correr y verificar que falla**

  Run: `cd apps/mobile && bun test --isolate src/features/business/data/repository.test.ts`
  Expected: FAIL — todavía lee `business_ownership`.

- [ ] **Step 3: La lectura nueva**

  `getBusinessesByOwnerId` consulta `business_members` con `user_id = ownerId`,
  `role = 'owner'`, `deleted_at is null`, `status = 'active'`, saca los `business_id` y
  busca los negocios con `.in('id', ids)`, como hoy. La RLS de `business_members` no filtra
  por `owner_id` sino por `user_id = auth.uid()`, así que **el `ownerId` que llega por
  parámetro es el mismo `auth.uid()` del cliente**; el comentario del código viejo («The
  RLS on that table is `owner_id = auth.uid()`, so a caller passing someone else's id gets
  an empty result») se conserva, reescrito con la columna nueva.

- [ ] **Step 4: Correr y verificar que pasa**

  Run: `cd apps/mobile && bun test --isolate ./src`
  Expected: PASS (los 3 fallos preexistentes de `mobile` siguen siendo 3; el plan 2 los
  midió como preexistentes: 734 / 3).

  Run: `bun run typecheck && bun run test && bun run build` — verde.

- [ ] **Step 5: Commitear**

  ```bash
  git commit -m "feat(mobile): el panel del dueño lee sus membresías, no la tabla vieja"
  ```

  **Vuelta atrás:** el revert del commit. La tabla vieja sigue existiendo hasta la Task 10,
  así que un revert a medias no rompe nada.

---

### Task 9: Los lectores de `business_ownership` se mudan

**Files:**
- Modify: `apps/api/src/modules/businesses/businesses.repository.ts` (`aggregateSelect:519-544`,
  el alta `:356-359`)
- Modify: `apps/api/src/modules/auth/auth-account.repository.ts` (`countRetained`)
- Modify: `apps/api/src/modules/announcements/announcements.repository.ts`
  (`ownerIdsForBusinesses:223-243`)
- Modify: `apps/api/src/modules/notifications/notification.handlers.ts:25-43`
- Test: los specs de cada módulo + `apps/api/src/database/security/business-members.rls.db.spec.ts`

**Interfaces:**
- Consumes: `business_members`.
- Produce: cinco lectores migrados, y **una policy nueva**: `Admins can view all business
  members` (SELECT, `authenticated`, `auth_helpers.my_role() = 'admin'`), que es lo que
  permite al panel de la plataforma leer el roster por la ruta que hoy usa
  `Admins can view all business ownership`.

**Los cinco lectores, y qué contesta cada uno** (verificados en el código, no de memoria):

| # | lector | qué contesta | por qué no es una comprobación de permiso |
| --- | --- | --- | --- |
| 1 | `businesses.repository.ts:523` (`aggregateSelect`) | «de quién es este negocio» — un **dato** de la fila, que el DTO expone como `owner_id: string` | no pregunta «¿puedo?»; la copia que sí lo preguntaba (`isOwner`) ya se movió en el Plan 2 |
| 2 | `businesses.repository.ts:357` (el alta) | escribe la fila de propiedad del negocio nuevo | es una escritura, no una lectura; y el trigger `trg_bootstrap_business_companions` **también** la escribe → los dos se van |
| 3 | `auth-account.repository.ts:106` (`countRetained`) | «¿cuántos negocios son míos» — el contador que decide entre anonimizar y borrar | alimenta el 409 y la rama del borrado |
| 4 | `announcements.repository.ts:227` (`ownerIdsForBusinesses`) | «quién publica» — resuelve `business_ids` a `user_ids` | va por PostgREST **con el token del operador**, a propósito, para que la lectura quede registrada como lo que ese operador puede ver |
| 5 | `notification.handlers.ts:36-39` | «a quién se avisa del pedido» — y aquí sí es una **regla de presencia**: un `INNER JOIN` que se come el handler entero | ver abajo |

**El quinto lector es el que hay que mover con cuidado, y el plan 2 lo dejó escrito:** el
`INNER JOIN` de `notification.handlers.ts` hace de `business_ownership` una **regla de
presencia**: un negocio sin fila de propiedad devuelve cero filas, el `if (!row) return;` se
come el handler entero y **no se avisa ni al consumidor ni al negocio, sin error y sin log**.
Migrado al modelo de membresías, la regla de presencia pasa a ser «el negocio tiene un
**dueño vivo**», y el test que hoy pinnea «un negocio SIN fila en `business_ownership` no
notifica a nadie» (`notification.handlers.spec.ts:92-110`) **cambia de nombre y de fixture**:
pasa a «un negocio SIN dueño vivo no notifica a nadie». **Es una edición deliberada y
visible**, y el plan 2 lo pidió así: el test existe para que el cambio sea una decisión y no
una eliminación silenciosa.

- [ ] **Step 1: Escribir los tests que fallan**

  ```ts
  // notification.handlers.spec.ts
  test('un negocio SIN dueño vivo no notifica a nadie', …)
  // el fixture deja el negocio sin membresía de dueño viva
  // (hoy borra la fila de business_ownership; el fixture nuevo borra la membresía)

  // businesses: el DTO del negocio sigue trayendo owner_id
  test('el listado de negocios trae el dueño del modelo de membresías', …)

  // announcements
  test('publicar un aviso resuelve los dueños por las membresías', …)
  ```

  Y en `business-members.rls.db.spec.ts`, la lista de policies de `business_members` pasa
  de 2 a 3 (se suma `Admins can view all business members`).

- [ ] **Step 2: Correr y verificar que falla**

  Run: `cd apps/api && bun test --isolate src/modules/notifications src/modules/announcements src/modules/businesses`
  Expected: FAIL — los lectores todavía leen la tabla vieja.

- [ ] **Step 3: Migrar los cinco**

  - `aggregateSelect`: el join pasa a `business_members` con `role='owner'`. **La regla del
    «dueño» cuando el negocio no tiene dueño vivo**: se toma el dueño **vivo** si hay uno, y
    si no, **el dueño archivado más reciente**. La razón es que `owner_id` es `string` en el
    DTO y no nullable, y que la liberación **archiva** la fila en vez de borrarla
    precisamente para que ese dato siga existiendo. En drizzle, el join con la condición
    de orden se hace con un `sql` en el `select` (no con `innerJoin`, que multiplicaría
    filas).
  - El alta del negocio: deja de escribir la fila de propiedad (la escribe el trigger, que
    también se va en la Task 10; entre las dos tareas, el alta escribe **sólo** la membresía
    de dueño, y el trigger sigue escribiendo la fila vieja hasta que la Task 10 lo cambie).
  - `countRetained`: el contador de negocios sale de las membresías de dueño vivas.
  - `ownerIdsForBusinesses`: lee `business_members` por PostgREST con el token del operador,
    como hoy. **Requiere la policy de admin nueva**, porque sin ella el operador no ve nada.
  - `notification.handlers.ts`: el `INNER JOIN` pasa a `business_members` con
    `role='owner'`, `deleted_at is null` y `status='active'`.

- [ ] **Step 4: Correr y verificar que pasa**

  Run: `cd apps/api && bun test --isolate ./src`
  Expected: PASS (los 10 fallos preexistentes de `api` siguen siendo 10: los 3 de
  `catalog-rpc-moderation-gate` y los 7 timeouts de `bug-report-inbox`).

  Run: `bun run typecheck && bun run test && bun run build` — verde.

- [ ] **Step 5: Commitear**

  ```bash
  git commit -am "refactor(api): los cinco lectores de business_ownership leen las membresías"
  ```

  **Vuelta atrás:** el revert del commit. La tabla sigue existiendo, así que nada se rompe
  por un revert a medias.

---

### Task 10: La tabla vieja cae

**Files:**
- Create: `supabase/migrations/<version>_drop_business_ownership.sql`
- Modify: `apps/api/src/database/schema/business-companions.ts` (quitar `businessOwnership`)
- Modify: `apps/api/src/database/schema/index.ts`
- Modify: `apps/api/src/database/security/business-members.rls.db.spec.ts` (la lista de 19 → 0)
- Modify: `apps/api/src/database/security/businesses.rls.db.spec.ts` (idem)
- Modify: `apps/api/src/database/security/orders.rls.db.spec.ts` (idem)
- Test: `apps/api/src/database/schema/mirror-fidelity.db.spec.ts`

**Interfaces:**
- Consumes: todo lo de las Tasks 8 y 9.
- Produce: **19 policies menos, una tabla menos, un trigger menos** y un espejo de Drizzle
  sin `businessOwnership`.

**Ésta es la última tarea de base, y el orden es lo que la hace posible:** el móvil ya no
lee la tabla (Task 8), los cinco lectores de la API ya no la leen (Task 9), y el trigger
`trg_bootstrap_business_companions` deja de crearla (esta misma tarea). Si se cae antes, el
panel del dueño se queda sin negocios y el handler de notificaciones se come las push.

- [ ] **Step 1: Escribir los tests que fallan**

  En `business-members.rls.db.spec.ts`, la lista de las 19 policies legacy pasa a `[]`, y
  el nombre del test cambia de «ninguna policy de negocio resuelve por `business_ownership`,
  y las viejas siguen exactamente las 19 que había» a «no queda ninguna policy que resuelva
  por `business_ownership`».

  En `businesses.rls.db.spec.ts` y `orders.rls.db.spec.ts`, los `expect` que nombran las
  policies viejas (`Owners can view own businesses`, `Business can view own orders`, …)
  desaparecen de la lista.

  En `mirror-fidelity.db.spec.ts`: el espejo de Drizzle no declara `business_ownership`.

- [ ] **Step 2: Correr y verificar que falla**

  Run: `cd apps/api && bun test --isolate src/database/security`
  Expected: FAIL — las 19 policies siguen en pie y la tabla existe.

- [ ] **Step 3: La migración**

  En este orden, en una sola migración:

  1. `drop policy` de las **19** policies legacy, con sus nombres exactos (la lista está
     escrita en `business-members.rls.db.spec.ts:2348-2368`).
  2. `create or replace function public.bootstrap_business_companions()` **sin** la
     escritura de `business_ownership` (la función crea `business_finance` y
     `business_moderation`, que se quedan). El trigger `trg_bootstrap_business_companions`
     **no se toca**: sigue siendo `AFTER INSERT ON businesses`, y su cuerpo cambia.
  3. `drop table public.business_ownership;` (con sus grants, que caen con la tabla).
  4. `revoke` de lo que quede.

  **El `detail` de la 23503**: si algo en la base todavía apunta a `business_ownership`, el
  `drop table` falla con `23503` y nombra la dependencia. Eso es el mecanismo de seguridad
  del `drop`: si algo se olvidó, la tabla no se cae.

- [ ] **Step 4: El espejo de Drizzle**

  `businessOwnership` sale de `business-companions.ts` y de `index.ts`. El
  `mirror-fidelity.db.spec.ts` compara el espejo con la base y falla si queda una tabla
  que ya no existe.

- [ ] **Step 5: Correr y verificar que pasa**

  Run: `cd apps/api && bun test --isolate src/database/security src/database/schema`
  Expected: PASS.

  Run: `bun run typecheck && bun run test && bun run build` — verde.

- [ ] **Step 6: Aplicar, sellar y commitear**

  ```bash
  git commit -am "feat(db): business_ownership y sus diecinueve policies se retiran"
  ```

  **Vuelta atrás:** **no hay vuelta atrás por `create table`**: una tabla con datos y
  políticas no se reconstruye con una migración. Ésta es la única tarea del plan cuya
  vuelta atrás **no** es una migración, y por eso el paso 1 es exhaustivo: el `drop table`
  sólo se ejecuta cuando las 19 policies ya están caídas y cuando los seis lectores
  (móvil + 5 de la API) ya están migrados. Si algo falla, la migración **no se aplica**
  (es una transacción) y el árbol queda como estaba. Si se aplicara y algo apareciera roto,
  la vuelta atrás es: recrear la tabla **vacía** (no con los datos) y restaurar las 19
  policies desde los archivos sellados — y **los negocios volverían a tener dueño, pero el
  histórico de propiedad se pierde**. Por eso, antes de aplicar, el paso 1 tiene que
  verificar que no queda **ninguna** lectura de la tabla en el repositorio:
  `grep -rn "business_ownership" apps/ packages/ --include=*.ts --include=*.tsx | grep -v "\.spec\.ts"`
  tiene que dar **cero** resultados fuera de los comentarios históricos.

---

### Task 11: El addendum, la auditoría de herencia y el cierre

**Files:**
- Modify: `docs/decisions/ADR-0013-accesos-de-staff-por-sucursal.md`
- Modify: `docs/superpowers/specs/2026-10-13-business-staff-access-design.md` (el §5.1 y el
  §12, que hoy dicen cosas que este plan cambia)
- Modify: `supabase/migrations/README.md` (la sección de las 19 policies)
- Modify: `docs/superpowers/plans/2026-10-16-business-staff-access-api.md` (la lista de
  herencia, que pasa de «abierto» a «cerrado»)

**Interfaces:**
- Consumes: todo lo anterior.
- Produce: el **addendum §B** del ADR-0013, escrito desde lo que se construyó.

- [ ] **Step 1: El addendum §B — «De «decidido» a «construido» (Plan 3)»**

  Con el mismo formato del addendum §A: **§B.1** las tres decisiones con el nombre del
  archivo y de la migración que las implementa; **§B.2** la regla del alcance, con las
  **catorce** policies que cambian, las **diez** que se quedan de negocio entero y la que no
  cambia porque es owner-only, y por qué; **§B.3** el invariante «un negocio activo tiene un
  dueño vivo» y por qué es un trigger diferido; **§B.4** la regla del negocio inactivo y
  quién reactiva; **§B.5** el retiro de `business_ownership` y los cinco lectores que se
  mudaron.

  **Escrito desde lo que se construyó, no desde lo que se planeó.** Si el implementador
  encontró algo distinto de lo que este plan dice, el addendum dice lo que se construyó y
  este plan se corrige.

- [ ] **Step 2: La auditoría de herencia** — la tabla de abajo, con la columna «tarea» de
  esta tabla. **Los 22 ítems, ninguno omitido.**

- [ ] **Step 3: El spec y el README**

  El §5.1 del spec dice hoy que `can_manage_location` le da el negocio entero al `manager`
  («owner -> todo el negocio / manager -> todo el negocio / staff -> sólo las locations de
  su fila de alcance»): eso **deja de ser cierto** y hay que corregirlo, con la misma
  honestidad con que el Plan 1 corrigió otras cosas. El §12 dice «Transferencia de
  propiedad del negocio» fuera de alcance: también hay que moverlo.

  `supabase/migrations/README.md` tiene una sección sobre las 19 policies y sobre el
  `drop table` pendiente: hay que actualizarla con el estado final.

- [ ] **Step 4: El cierre**

  ```sh
  bun run typecheck
  bun run test
  bun run build
  ```

  **Y la línea base, medida como la midió el Plan 2**, que es la parte que el plan 2
  escribió con más cuidado y que hay que repetir: `apps/api/drizzle/` está en `.gitignore`
  (sin él las specs de base revientan con `ENOENT`) y `packages/commons` hay que
  **construirlo** antes de correr `admin`, `landing` y `mobile`. Los 18 fallos de la línea
  base (1 en `landing`, 4 en `admin`, 3 en `mobile`, 10 en `api`) son **preexistentes** y este
  plan **no agrega ni arregla ninguno**: el criterio de aceptación es «los mismos 18, con
  los mismos nombres».

- [ ] **Step 5: Commitear**

  ```bash
  git commit -am "docs(adr,spec): la transferencia, el alcance y la jubilación, como se construyeron"
  ```

---

## La obligación de mutación

**El modelo es la Task 6 del Plan 1**: leer en plano no alcanzó — «la lectura a simple vista
no vio a seis empleados vivos bajo un tope de dos»—, y lo que lo encontró fue **aplicar la
mutación y ver la suite ponerse roja**. Un test que no se ha visto fallar no es un test: es
una aserción.

**Cada mutación de esta lista tiene que romper la suite.** Si alguna no la rompe, la
mutación está mal escrita o el test que la debería cubrir no existe. **Este paso no es
opcional y no se hace «al final»**: se hace con cada tarea, antes de commitearla, y el
resultado (rojo, con el nombre del test que se puso rojo) va en el mensaje del commit.

| # | mutación | dónde | qué tiene que romperse |
| --- | --- | --- | --- |
| M1 | **El dueño pierde su alcance implícito**: en `can_manage_location`, `r.member_role = 'owner'` → `r.member_role = 'manager'` | Task 2 | la matriz «el dueño lee y escribe el negocio entero» |
| M2 | **El alcance vacío se trata como todo**: en `can_manage_location`, la rama del `exists` de alcance pasa a `true` cuando el miembro no tiene filas | Task 2 | «un gerente SIN alcance no lee ningún producto» y «un empleado SIN alcance no lee ningún producto» |
| M3 | **El empleado queda sin acotar**: se borra el `exists` sobre `business_member_locations` | Task 2 | «un empleado con alcance en A lee los productos de A y no los de B» |
| M4 | **La policy de lectura queda de negocio entero**: `Owners and managers view business members` vuelve al predicado por rol | Task 2 | «un gerente no ve en el roster el alias de un acceso fuera de su alcance» |
| M5 | **La contención se vuelve intersección en vez de subconjunto**: `business_member_reaches_member` pasa a exigir sólo que se intersecten los alcances | Task 1 | «un gerente NO alcanza el acceso cuyo alcance sale del suyo» |
| M6 | **El alcance vacío del que llama vuelve a ser todo**: `business_member_covers_locations` pasa a devolver `true` con un array vacío | Task 1 | «el conjunto vacío de sucursales lo cubre sólo el dueño» (ítem 18) |
| M7 | **La transferencia degrada y no promueve**: `transfer_business_ownership` salta el paso de promover | Task 3 | «un negocio activo no puede quedar sin dueño» (el trigger diferido aborta el commit) |
| M8 | **La transferencia no es del dueño**: la función acepta a cualquiera como llamador | Task 3 | «sólo el dueño actual puede transferir» |
| M9 | **La liberación no exige que el negocio esté inactivo**: se borra la comprobación de `is_active` | Task 5 | «la liberación de un negocio activo se niega» |
| M10 | **La reactivación no exige dueño**: el trigger de `businesses` pierde la comprobación | Task 5 | «un negocio sin dueño no se reactiva» |
| M11 | **La puerta del borrado vuelve a contar los dueños de negocios inactivos** | Task 5 | «el dueño de un negocio inactivo sí puede borrar su cuenta» |
| M12 | **La combinación de «vencida» vuelve a estar escrita en TypeScript**: `sessionInsidePromise` vuelve a su forma anterior | Task 7 | «el módulo de membresía no reescribe la combinación» |

**Cómo se ejecuta una mutación:** se edita el archivo (la migración, en el caso de las
mutaciones de SQL: **se edita el archivo antes de aplicarlo**, nunca el archivo sellado),
se corre el spec, se anota el nombre del test que se puso rojo, y se revierte. Para las
mutaciones de SQL hay una alternativa más limpia y preferible: **escribir la mutación
como una `create or replace` dentro de una transacción de prueba y hacer `rollback`**, que
es lo que permite el harness (`as()` / `deniedAs()` abren transacciones). La regla del
repo (`supabase/migrations/README.md`) es que **un archivo sellado no se edita**: una
mutación sobre un archivo sellado se hace en una transacción de prueba, no en el archivo.

---

## La auditoría de herencia (los 22 ítems del Plan 2)

Ninguno se omite. Cada uno está cerrado por una tarea, cerrado de antemano, o diferido con
su razón.

| # | ítem | estado | tarea / razón |
| --- | --- | --- | --- |
| 1 | `getBusinessesByOwnerId` y el `drop table business_ownership` con sus 19 policies | **cerrado** | Tasks 8 y 10 |
| 2 | El acantilado de performance (~328 µs por fila en el camino de miembro) | **diferido** | medido y escrito en `supabase/migrations/README.md`; el lever es el costo por fila del helper, y no urge antes de que un negocio se acerque a 1.000 pedidos. Este plan **no** optimiza ese costo: el helper nuevo se llama **una vez por fila de policy**, no una vez por fila de la tabla, pero eso no se mide acá y queda como deuda anotada, igual que hoy |
| 3 | El `Seq Scan on orders` dentro del subplan hasheado de la policy de `profiles` | **diferido** | es un eje de tabla, medido y anotado; este plan no cambia la forma de la policy de `profiles` más que por el predicado que ya usa |
| 4 | El guard que compara `BUSINESS_PLAN_LIMITS` contra los triggers | **ya cerrado** | existe (`plan-limits.db.spec.ts`) y este plan **no toca el catálogo de planes**, así que el guard tiene que seguir verde: se verifica en el Task 11 |
| 5 | El QUINTO lector de `business_ownership` (`notification.handlers.ts:36-39`) | **cerrado** | Task 9, con el cambio deliberado del test que lo pinnea |
| 6 | La transferencia de propiedad NO EXISTE | **cerrado** | Tasks 3 (la base) y 4 (la puerta) |
| 7 | Un dueño legacy que sólo vive en `business_ownership` borra su cuenta en silencio | **cerrado** | Task 5. **El backfill NO se hace**: medido, hay **0** filas en ese estado (0 `business_ownership` sin membresía, 0 membresías sin `business_ownership`). Lo que se cierra es el **camino**: la puerta cuenta sólo dueños de negocios activos y `anonymise` borra la fila de propiedad |
| 8 | La combinación de «vencida» duplicada en TypeScript | **cerrado** | Task 7 |
| 9 | `R0001` cubre DOS negativas (tope y entitlement) | **diferido** | este plan **no** adopta `R0003`: el panel no lo conoce y este plan no toca el panel. La transferencia usa `R0004`, un código **nuevo**, así que `R0001` sigue significando exactamente las dos cosas que significa hoy |
| 10 | La contención del `manager` sólo la aplica esta API, y no es una frontera para las cuatro policies de escritura | **cerrado** | Tasks 1 y 2. El detalle: eran **cuatro**, y el plan verificó que son **trece** las policies que usan `can_manage_location` (tabla completa más arriba) |
| 11 | La rama de admin de plataforma de `GET /staff` no está acotada | **diferido** | el admin **supervisa**, no administra: leer el roster de cualquier negocio es deliberado y está pineado por un test. Este plan le **agrega** una puerta de escritura (Task 6) y no le quita ninguna de lectura |
| 12 | El aviso de «tu dirección cambió» se encola a la dirección actual sin comprobar la entregabilidad | **diferido** | el §8 nombra los dos endpoints que rechazan el **identificador enviado**, no el actual; y el rebote cae en el dominio del negocio, no en el de Rolé |
| 13 | La propiedad «la cascada no destruye una membresía» vive sólo en el servicio | **cerrado** | Task 5 (`eraseAccount` archiva las membresías vivas antes de borrar el perfil) |
| 14 | El borrado archiva la membresía pero no sus filas de alcance | **cerrado** | Task 5 (`anonymise` archiva también las `business_member_locations`) |
| 15 | El servicio escribe `role: 'staff'` explícitamente | **diferido** | el default de la columna no es una frontera: el API y el esquema coinciden hoy, y quitar el default sería un cambio sin una decisión detrás |
| 16 | El 404 «Negocio no encontrado» es inalcanzable | **diferido** | es un problema del **fixture** del spec (le da una membresía en un negocio inexistente), no del producto; y el fixture es de `create`, que este plan no toca |
| 17 | La compensación del alta es best-effort | **diferido** | la compensación existe; lo que falta es el mensaje al dueño («y la cuenta puede seguir existiendo»), y el mensaje es de la pantalla del panel, que este plan no construye |
| 18 | El alcance vacío del que llama no está documentado ni testeado | **cerrado** | Task 1. La regla es explícita: **sin filas de alcance no se alcanza nada, ni siquiera un acceso sin alcance** (sólo el dueño lo alcanza) |
| 19 | Las nueve rutas no tienen bucket de throttler propio | **diferido** | el tope global (100/min/IP) cubre las dos rutas nuevas; la presión sobre GoTrue viene de `createUser`, que este plan no agrega a una ruta nueva (la recuperación crea el acceso por la puerta que ya existe) |
| 20 | Un round-trip más por lectura de pedido (`roleOf`) | **diferido** | es un ítem de performance, con el mismo lever que el 2 |
| 21 | El test del token forjado afirma sólo el status | **diferido** | los tests **nuevos** de esta plan (transfer, restore) **sí** afirman el cuerpo de la respuesta y el código; el test viejo no se toca porque cambiarlo no es una decisión de este plan |
| 22 | El módulo no afirma el provider del `service_role` | **diferido** | los providers del módulo no cambian; el `STAFF_AUTH_ADMIN` sigue siendo el mismo. (El módulo **sí** crece: registra el controlador de ownership) |

**Resumen:** **9** ítems cerrados por tareas (1, 5, 6, 7, 8, 10, 13, 14, 18), **1** ya
cerrado antes de este plan (4) y **12** diferidos con su razón escrita. Ninguno sin destino.

---

## Fuera de este plan (no-goals)

Explicitamente, para que la rama no crezca:

1. **La pantalla del panel** (admin y móvil) que llama a las dos rutas nuevas. La API
   existe; el botón no. La interfaz de «Equipo» del panel y las dos pestañas de admin son
   un plan aparte (§9.2 y §10 del spec).
2. **El login condicional del §9.1** (los chips de cuentas, el «¿olvvidaste tu
   contraseña?» para `.role.ec`, el escáner de la tarjeta). Es un plan aparte del móvil; este
   plan sólo deja `isRoleEcAlias` viva, como el addendum §A.4 pide.
3. **El filtrado de configuración por rol mínimo del §9.3.** Es UI, y el §9.3 ya decidió
   que el filtrado es de UI. Lo que este plan hace es lo que el §9.3 no podía hacer: que la
   **base** acote al gerente.
4. **El alias editable y su aviso** (§9.4). El §9.4 del spec y el addendum §A.4 ya están
   construidos en `packages/commons`; lo que falta es la pantalla.
5. **La edición de alias desde la app** y la tarjeta de entrega con QR.
6. **La eficiencia del helper de alcance** (el ítem 2 de la herencia): este plan **no**
   optimiza el costo por fila; lo mide y lo deja escrito.
7. **La pantalla de admin que muestra los negocios sin dueño.** La base los hace
   imposibles de reactivar sin dueño (Task 5), así que el estado es raro y explícito, pero
   **verlo** en una tabla del panel es otra historia.
8. **Facturación, planes y `visibility_plus`** (§12 del spec).
9. **El borrado físico de membresías** (§12): sigue siendo lógico, y ahora además es lo que
   hace posible borrar un negocio liberado.

---

## Cierre

El plan cierra cuando:

- `bun run typecheck`, `bun run test` y `bun run build` están verdes, y `bun run test` no
  agrega ni un fallo a los **18** de la línea base (1 `landing` + 4 `admin` + 3 `mobile` +
  10 `api`), con los mismos nombres.
- Las **12 mutaciones** de la lista se rompieron una por una, y cada commit dice qué test
  se puso rojo.
- Los **22 ítems** de la herencia tienen destino: 9 cerrados por tareas, 1 ya cerrado, 12
  diferidos con su razón escrita.
- El addendum §B del ADR-0013 está escrito **desde lo que se construyó**.
- La base viva tiene **0** policies que resuelvan por `business_ownership`, y la tabla no
  existe.
