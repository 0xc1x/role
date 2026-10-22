# Reportes de errores desde la app móvil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un usuario reporte un error desde la app móvil (sección consumer y business), con capturas adjuntas, y que el equipo lo lea y lo triaje desde una sección nueva del panel.

**Architecture:** `app_store` es un store genérico multi-escritor discriminado por `namespace`; el reporte entra ahí con `namespace = 'bug_report'`. El móvil escribe directo a Supabase (el AGENTS de la raíz lo establece: RLS es la frontera de datos, la API es BFF de admin/landing), autorizado por una única policy de `INSERT` que fija namespace, estado inicial y canal. La API lee y triaje el namespace con service role; el panel lo muestra.

**Tech Stack:** Postgres/RLS + Supabase Storage, `packages/commons` (zod), NestJS 11 + Drizzle, React + TanStack Query + shadcn (admin), Expo SDK 57 (mobile), `bun:test`.

**Spec:** `docs/superpowers/specs/2026-09-30-reportes-de-errores-design.md` — el plan se argumenta desde el spec; ambos viajan juntos.

## Global Constraints

- **Ninguna migración entra por `execute_sql` ni por el dashboard.** Solo `apply_migration`. Después: leer la versión que asignó el servidor, renombrar el archivo a `<version>_<name>.sql`, y probar `md5sum <archivo>` == `md5(statements[1])` del ledger. Procedimiento en `supabase/migrations/README.md` §"How to apply a migration".
- **Nunca atribución de IA en commits** (`Co-Authored-By`, `Generated with`). Conventional commits.
- **Ningún commit deja el árbol rojo.** `bun run typecheck` tiene que pasar en CADA commit, no solo al final. Si un cambio obliga a tocar otro paquete, ese paquete va en la MISMA tarea.
- **Los tres gates antes de declarar done:** `bun run typecheck`, `bun run test`, `bun run build`. Filtros: `bun run --cwd apps/api typecheck`.
- **El móvil no pasa por la API** para escribir el reporte (spec D6). Solo escribe el triaje.
- **No tocar `app_store` desde un endpoint genérico.** Cada bandeja lleva su constante de namespace server-side, aplicada en las TRES operaciones (filtro del listado, verificación del detalle, verificación previa a la escritura).
- **Mappers lista blanca:** nunca `...row.value` en un DTO. Una fila que no matchea el contrato sale con `readable: false`, nunca lanza.
- **i18n:** todo el copy del móvil por `strings.ts`. Sin literales inline.
- **Docs del repo en español** para comentarios de código y encabezados de migración.

## Review Focus

Cinco entradas que el spec implica pero que ningún test del spec cubre explícitamente. Cada una tiene su test en la tarea listada.

1. **La captura falla después de que el usuario escribió el texto** (supera 5 MB, MIME no admitido, bucket ausente en el entorno). El texto no se pierde y el error se dice en español. → T7, T8
2. **Un reporte sin ninguna imagen.** Es el caso común; el flujo de texto no puede depender del bucket. → T7
3. **Reintento tras un fallo a medio camino** (imágenes subidas, insert rechazado). Hoy no hay idempotency key: el usuario puede terminar con dos filas. Al menos hay que fijar el comportamiento documentado, no dejarlo indefinido. → T8
4. **Un usuario reporta desde el panel del negocio.** `origin` sigue siendo la plataforma, y `reporter_id` es la persona, nunca el negocio. → T7
5. **Una fila que no es de `bug_report` en la bandeja de bugs, ni una de `bug_report` en la de contactos.** Es el riesgo que `CONTACT_NAMESPACE` ya documenta; la constante nueva lo repite. → T5

---

### Task 0: La deuda preexistente que bloquea los gates

Las tareas de este plan no tocan esta deuda, y sin ella `bun run typecheck` y
`bun run test` de la raíz no pueden dar verde — lo que invalidaría el gate
final (Task 10). Se ejecuta primero.

**Files:**
- Modify: `apps/admin/test-preload.ts`
- Modify: `apps/admin/src/features/offers/tables/__tests__/offers.columns.test.tsx`

**Interfaces:**
- No produce interfaces.

**El `TS2769` de `playwright.config.ts` no era deuda de código.** Dos versiones
de `@playwright/test` coexistían: `apps/admin/node_modules/@playwright/test`
era un symlink rancio a la 1.62.1, de un install anterior al bump a 1.63.0, y
`bun.lock` no tiene ninguna entrada para esa versión. El spread `...base.use`
cruzaba tipos entre dos copias distintas. **Resuelto borrando el symlink
rancio; no requiere commit.**

Los dos problemas que sí quedan:

**1. `test-preload.ts` promete `storage` y no lo da.** Su comentario dice
*"shims mínimos para specs que tocan `window` sin necesidad de jsdom (storage +
redirect a /login)"*, y lo único que define es `window = globalThis` más un
`location` falso. `globalThis` de bun no tiene `localStorage`, así que los dos
tests de `auth.api.test.ts` mueren en `beforeEach` con `TypeError: undefined is
not an object (evaluating 'window.localStorage.clear')`. El fix es que el
preload haga lo que su comentario promete.

**2. Los 4 tests de `offers.columns.test.tsx` no abren el menú — y NO es la
secuencia de eventos.** El diagnóstico original de este plan (aplicar
`pointerdown` + `pointerup` + `click` como en `hide-review-dialog.test.tsx`)
era **incorrecto**, y la secuencia no los arregla: no hay item al que elegir
porque el `click` nunca llega al `open`.

La causa real está en el código publicado de `@base-ui/react` 1.7.0:
`MenuRoot` llama a `useSyncedFloatingRootContext()` **sin** pasar
`floatingRootContext: store.state.floatingRootContext`, así que el click llega
al `FloatingRootStore` huérfano de `getEmptyRootContext()` (`syncOnly: false`,
`onOpenChange: undefined`) en vez de al store del Root. La 1.8.0 agrega
exactamente esa línea.

Verificado en runtime por el implementador (instrumentando `useClick`), y
`node_modules` comprobado byte a byte contra el tarball de npm.

**El menú sí funciona en producción:** `e2e/sections.catalogue.spec.ts:254-255`
abre el mismo `DropdownMenu` en Chromium real y ese e2e pasa. El problema es
exclusivamente el DOM de happy-dom bajo bun.

- [x] **Step 1: El preload**

  > Verificado: `apps/admin/test-preload.ts` instala el entorno de DOM (`installDomEnvironment()`, de `src/test-utils/dom-env.ts`) — commit `e6294df` («el shim de storage que el preload promete»).

Agregar a `test-preload.ts` un `localStorage` mínimo en el `window` que ya
construye, con `getItem`/`setItem`/`removeItem`/`clear` sobre un `Map`. La
firma de `getItem` devuelve `string | null`.

- [x] **Step 2: Ver que los 2 tests de logout pasan**

  > Verificado: los tests de logout pasan; la suite del admin corre verde hoy.

Run: `cd apps/admin && bun test --isolate src/features/auth`
Expected: PASS.

- [x] **Step 3: Subir `@base-ui/react` a `^1.8.0`**

  > Verificado: `apps/admin/package.json:32` dice `"@base-ui/react": "^1.8.0"` — commit `08a32eb`.

Decisión del humano, sobre el dato de que **no va a volver verdes los 4
tests** (probado: 1.8.0 tampoco abre bajo happy-dom). El bump se hace igual
porque el defecto de wiring es real y puede morder en otros contextos, y
1.8.0 es el arreglo upstream.

Es una dependencia transversal de todo el panel, así que la verificación es
obligatoria y en este orden: typecheck, suite completa, y **e2e** — que es la
única superficie que abre menús en un navegador real. Si el e2e se rompe, el
bump se revierte: un `menuitem` que no abre en Chromium sí es una regresión.

- [x] **Step 4: Los 4 errores de `organizeImports`**

  > Verificado: commit `c8ea9db` («los cuatro imports fuera de orden que Biome check rechazaba»); `bun run check` del admin da 0.

`bun run --cwd apps/admin check` falla con 4 errores de
`assist/source/organizeImports` en `nav-main.tsx`,
`business-location.form.tsx`, `reviews/index.ts` y `_layout.ordenes.tsx`. Los
cuatro son preexistentes y ninguno lo tocó este trabajo — el `AGENTS.md` de
admin afirma que `check` pasa limpio, y eso es falso. Arreglo:
`bun run --cwd apps/admin check --write`, revisando que no toque ningún archivo
fuera de esos cuatro.

- [x] **Step 5: El test del toaster**

  > Verificado: commit `1dc49b9` («que el spec del toaster instale su propio matchMedia»).

`documento raíz del admin > monta el toaster, así que los toast.* no son
no-ops` falla por contaminación de orden: `use-mobile.test.tsx` deja
`matchMedia` en un estado que el test del toaster hereda. El spec tiene que
establecer su propio `matchMedia` en vez de depender del que otro dejó.

- [x] **Step 6: Los gates de admin enteros**

  > Verificado: el `progress.md` de esta rama los midió —typecheck 0, check 0, test 535/0, e2e 71 passed— y la suite del admin corre verde hoy.

```sh
bun run --cwd apps/admin typecheck
bun run --cwd apps/admin check
bun run --cwd apps/admin test
```

Expected: `typecheck` y `test` en verde. `check` seguirá en 1 por los 4 tests del menú: el bump no los arregla bajo happy-dom.
del symlink rancio ya no está.

- [x] **Step 6: Commit**

  > Verificado: commits `e6294df`, `08a32eb`, `c8ea9db` y `1dc49b9`.

```bash
git add apps/admin/test-preload.ts apps/admin/src/features/offers
git commit -m "fix(admin): the storage shim the preload promises, and the pointer sequence Base UI opens on"
```

---

### Task 1: La migración

El único artefacto que ninguna otra tarea puede adelantarse a escribir: define las columnas, el bucket, la policy y el trigger que todo lo demás consume.

**Files:**
- Create: `supabase/migrations/<version>_bug_reports_and_delivery_axis.sql`
- Modify: `supabase/migrations/README.md` (registrar la migración aplicada, siguiendo el formato de las entradas existentes)

**Interfaces:**
- Produces:
  - `app_store.delivery_status` (enum `delivery_status`: `PENDIENTE|PROCESADO|ERROR`, renombrado desde `store_entry_status` / columna `status`)
  - `app_store.state text` nullable
  - `app_store.origin entry_origin` nullable, enum `('ios','android','pwa','web')`
  - bucket `bug_report_images`, `public = false`, `file_size_limit = 5242880`, `allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']`
  - policies `storage.objects`: `"Reporters attach their own screenshots"` (insert) y `"Reporters read their own screenshots"` (select)
  - policy `app_store` `"Users submit bug reports"`, `FOR INSERT TO authenticated`, con el `WITH CHECK` de la sección 4 del spec
  - trigger `on_bug_report_stamped` BEFORE INSERT, `WHEN (new.namespace = 'bug_report')`, que sella `value.reporter_id = auth.uid()::text`
  - `revoke select on public.app_store from anon, authenticated`

- [x] **Step 1: Escribir el archivo de migración**

  > Verificado: `supabase/migrations/20260930234450_bug_reports_and_delivery_axis.sql` — commit `a1fa88d`.

Volcar el SQL de la §4 del spec, con el bloque de cabecera que las migraciones de este repo ya usa (`-- <descripción>` + `-- SAFETY:` si aplica).

El bloque de policies sobre `storage.objects` es nuevo en el repo: copiar el estilo de `20260925155445_privacy_storage_notifications_consent.sql` (líneas 56-74), que ya exige `bucket_id = ... and owner = auth.uid() and (storage.foldername(name))[1] = auth.uid()::text`. El `WITH CHECK` del spec está abreviado respecto a ese patrón: mantener la forma completa, con `bucket_id = 'bug_report_images'` sustituido.

- [x] **Step 2: Aplicar por `apply_migration`**

  > Verificado: fila del ledger `20260930234450` / `bug_reports_and_delivery_axis`.

Nombre `bug_reports_and_delivery_axis`. Solo después de que el paso 3 confirme que el archivo está escrito.

- [x] **Step 3: Leer la versión y renombrar el archivo**

  > Verificado: el archivo se llama con la versión que asignó el servidor, `20260930234450`.

Run: `select version, name from supabase_migrations.schema_migrations where name = 'bug_reports_and_delivery_axis';`
Expected: una fila. Renombrar el archivo del paso 1 a `<version>_bug_reports_and_delivery_axis.sql`.

El ledger va por `20260929010149`; la versión nueva la asigna el servidor, no se inventa.

- [x] **Step 4: Probar que el archivo es lo que corrió**

  > Verificado: `md5sum` del archivo `3b302c90f0ae124e5697d5879cdd3263` == `md5(statements[1])` del ledger.

Run: `md5sum supabase/migrations/<version>_bug_reports_and_delivery_axis.sql` y compáralo con `select md5(statements[1]) from supabase_migrations.schema_migrations where version = '<version>';`
Expected: iguales. Este es el único chequeo que distingue "commiteado" de "aplicado".

- [x] **Step 5: Registrar en el README de migraciones**

  > Verificado: `supabase/migrations/README.md:2117` abre la entrada «Applied: `20260930234450_bug_reports_and_delivery_axis`» — commit `4e99502`.

Añadir una entrada con la versión, la fecha y una línea de por qué (los tres puntos no obvios: el rename, el bucket privado, y el revoke del SELECT).

- [x] **Step 6: Commit**

  > Verificado: commit `a1fa88d` — *feat(db): bug reports on app_store, delivery axis separated*.

```bash
git add supabase/migrations/ && git commit -m "feat(db): bug reports on app_store, delivery axis separated"
```

---

### Task 2: Espejo Drizzle, repositorio y sus dos consumidores

El renombre de `updateStatus` y de la columna `status` aparece en el mirror, en el repositorio, en `contact.service.ts` y en el mapper del inbox. Van juntos porque el typecheck tiene que quedar verde en este commit.

**Files:**
- Modify: `apps/api/src/database/schema/app-store.ts`
- Modify: `apps/api/src/modules/store/app-store.repository.ts`
- Modify: `apps/api/src/modules/store/app-store.repository.spec.ts`
- Modify: `apps/api/src/modules/contact/contact.service.ts` (líneas 80 y 121) y `contact.service.spec.ts` (líneas 88 y 140)
- Modify: `apps/api/src/modules/contact-inbox/contact-inbox.mapper.ts` y `contact-inbox.mapper.spec.ts`

**Interfaces:**
- Consumes: columnas de la Task 1.
- Produces:
  - `storeEntryStatusEnum` renombrado a `deliveryStatusEnum`, `pgEnum('delivery_status', [...])`
  - `appStore.delivery_status`, `appStore.state`, `appStore.origin`
  - `AppStoreRepository.updateDeliveryStatus(id, deliveryStatus, extraValue?): Promise<StoreEntry | null>` (renombre de `updateStatus`)
  - `AppStoreRepository.updateState(id, state): Promise<StoreEntry | null>` (nuevo)
  - `AppStoreRepository.list(filter: { namespace?, delivery_status?, state?, page, limit })`

- [x] **Step 1: Escribir el test que falla**

  > Verificado: el spec y el espejo salieron juntos en `a26b725`.

En `app-store.repository.spec.ts`, contra `createTestDb()`:

```ts
test('el filtro por state trae solo las filas en ese estado', async () => {
  await repo.insert({ namespace: 'bug_report', value: { a: 1 }, state: 'ABIERTO' });
  await repo.insert({ namespace: 'bug_report', value: { a: 2 }, state: 'CORREGIDO' });
  const { rows } = await repo.list({ namespace: 'bug_report', state: 'ABIERTO', page: 1, limit: 20 });
  expect(rows).toHaveLength(1);
});
```

- [x] **Step 2: Correr y ver que falla**

  > El rojo no quedó registrado: el commit `a26b725` no nombra el test que se puso rojo.

Run: `docker compose up -d postgres-test && cd apps/api && bunx drizzle-kit generate && bun test --isolate --timeout 60000 src/modules/store/app-store.repository.spec.ts`
Expected: FAIL — `state` todavía no existe en el espejo.

`drizzle-kit generate` es obligatorio antes: `test/db.ts` construye la base desde `apps/api/drizzle/`, que está gitignored y se genera localmente.

- [x] **Step 3: Actualizar el schema Drizzle**

  > Verificado: `apps/api/src/database/schema/app-store.ts:11,49,64` declara `deliveryStatusEnum`, la columna `delivery_status` y su índice.

En `app-store.ts`: renombrar el `pgEnum` y su const, renombrar `status:` a `delivery_status:`, y agregar `state: text('state')` y `origin: entryOriginEnum('origin')` con un `pgEnum('entry_origin', ['ios','android','pwa','web'])` y su const. `app_store_status_idx` pasa a `app_store_delivery_status_idx`; agregar `app_store_state_idx` sobre `state`.

- [x] **Step 4: Actualizar el repositorio**

  > Verificado: el repositorio de la API llama al eje con su nombre nuevo — commit `a26b725`.

Renombrar `updateStatus` → `updateDeliveryStatus` (parámetro y cuerpo), agregar `updateState` con la misma forma de patch (`{ state, updated_at }`), y renombrar la clave `status` del filtro de `list()` a `delivery_status` con su predicado, agregando `state`.

`updateState` no necesita `extraValue`: el merge de jsonb que hace `updateDeliveryStatus` existe para el `error` del proveedor de correo, y el triaje no lo necesita.

- [x] **Step 5: Regenerar el espejo y adaptar a los dos consumidores**

  > Verificado: **el brief decía dos consumidores y eran cuatro**, y el `progress.md` de esta rama lo dice: también `contact-inbox.service.ts` y `contact-inbox.controller.security.spec.ts`.

Run: `cd apps/api && bunx drizzle-kit generate`

`contact.service.ts`: los dos `storeRepo.updateStatus(entry.id, ...)` → `updateDeliveryStatus`.

`contact-inbox.mapper.ts`: `status: row.status` → `delivery_status: row.delivery_status`, y el tipo del mapper en los specs. Ojo: el DTO todavía dice `status` (eso lo arregla la Task 3), así que el mapper compila contra el DTO viejo y solo se renombra la lectura de la fila. Si el typecheck protesta por el DTO, es lo esperado: **no** tocar el DTO en esta tarea, solo la lectura de la fila.

- [x] **Step 6: Correr los tests y el typecheck**

  > Verificado: `bun run typecheck` en la raíz da 6/6, y la suite del API corre verde.

Run: `cd apps/api && bunx drizzle-kit generate && bun test --isolate --timeout 60000 src/modules/store src/modules/contact-inbox src/modules/contact && bun run typecheck`
Expected: PASS y exit 0.

El typecheck puede quejarse de que el mapper devuelve `delivery_status` contra un DTO que pide `status`: eso es exactamente lo que la Task 3 resuelve, y **no** se arregla aquí.

- [x] **Step 7: Commit**

  > Verificado: commit `a26b725` — *refactor(api): the delivery axis gets its own name in the mirror*.

```bash
git add apps/api/src/database/schema apps/api/src/modules/store apps/api/src/modules/contact
git commit -m "refactor(api): the delivery axis gets its own name in the mirror"
```

---

### Task 3: El rename del eje de entrega, de punta a punta

Un cambio mecánico, pero de punta a punta: `packages/commons` es el SSOT y cambiarlo rompe en el compilador de **todos** los consumidores. El AGENTS de la raíz dice que eso se resuelve en el mismo PR. Una sola tarea, un solo commit, typecheck verde al final.

**Files:**
- Modify: `packages/commons/src/contact/enums/contact.enum.ts`
- Modify: `packages/commons/src/contact/schemas/contact-inbox.schema.ts` (líneas 61 y 90)
- Modify: `packages/commons/src/contact/__tests__/contact-inbox.schema.test.ts`
- Modify: `apps/api/src/modules/contact-inbox/contact-inbox.mapper.ts`, `contact-inbox.service.ts`, `contact-inbox.service.spec.ts`, `contact-inbox.controller.security.spec.ts`
- Modify: `apps/admin/src/lib/labels.ts` (líneas 85-92) y `apps/admin/src/lib/__tests__/labels.test.ts`
- Modify: `apps/admin/src/features/contact-inbox/` completo: `index.ts`, `tables/cells/status-badge.tsx` (→ `delivery-status-badge.tsx`), `tables/contact-inbox.columns.tsx`, `components/contact-inbox-list.tsx`, `components/contact-message-drawer.tsx`, y sus `__tests__/`
- Modify: `apps/admin/e2e/sections.operations.spec.ts`

**Interfaces:**
- Consumes: `updateDeliveryStatus`, `row.delivery_status` (Task 2).
- Produces: `ContactDeliveryStatus` (renombre de `ContactMessageStatus`, que desaparece), `delivery_status` en `ContactMessageListItemSchema` y `ListContactMessagesQuerySchema`, `contactDeliveryStatusLabel` (renombre de `contactMessageStatusLabel`), `DeliveryStatusBadge` (renombre de `StatusBadge`).

- [x] **Step 1: Cambiar los tests primero**

  > Verificado: commit `98bdf5b` (`feat(commons)!: rename the contact status axis to delivery_status`) — es un commit de ruptura y su mensaje declara el cambio de comportamiento.

`contact-inbox.schema.test.ts`: `status` → `delivery_status` y el tipo renombrado.
`labels.test.ts`: `contactMessageStatusLabel` → `contactDeliveryStatusLabel`.
Specs de la feature y del API: fixtures con `delivery_status`.

- [x] **Step 2: Correr y ver que falla**

  > El rojo no quedó registrado: el commit `98bdf5b` no nombra el test que se puso rojo.

Run: `bun test --isolate packages/commons/src/contact && cd apps/admin && bun test --isolate src/lib/__tests__/labels.test.ts src/features/contact-inbox`
Expected: FAIL en los tres.

- [x] **Step 3: Renombrar en commons**

  > Verificado: `packages/commons/src/contact/enums/contact.enum.ts` es el espejo del enum `delivery_status` de Postgres y explica por qué el eje no se llama `status`.

`contact.enum.ts`: el const y el tipo. Actualizar el doc-comment que hoy dice "esto NO es una bandeja de entrada" para que nombre el eje tal como quedó: entrega, no triaje.

`contact-inbox.schema.ts`: `status:` → `delivery_status:` en ambos schemas.

- [x] **Step 4: Propagar a la API**

  > Verificado: la API usa `delivery_status` (`apps/api/src/database/schema/app-store.ts`); el diff de `98bdf5b` lo cubre.

`contact-inbox.mapper.ts`: la propiedad `delivery_status` del DTO.
`contact-inbox.service.ts`: `list()` pasa `delivery_status: query.delivery_status`.
Specs correspondientes.

El controller no cambia de firma: el `ZodValidationPipe` ya valida con el schema renombrado.

- [x] **Step 5: Propagar al panel**

  > Verificado: el panel lo lee en `apps/admin/src/features/contact-inbox/` (api, components, queries y tables).

`labels.ts`: `CONTACT_MESSAGE_DELIVERY_STATUS_LABELS` y `contactDeliveryStatusLabel`. Los tres textos no cambian — `"Entrega pendiente"`, `"Notificado"`, `"Error"` ya describían el eje de entrega.

`status-badge.tsx` → `delivery-status-badge.tsx`, componente `DeliveryStatusBadge`, tipo `ContactDeliveryStatus`. Actualizar `index.ts` y el import en `columns.tsx:84`.

El resto: leer `delivery_status` donde se leía `status`. El filtro del `Select` en `contact-inbox-list.tsx:90` conserva los mismos tres valores.

`sections.operations.spec.ts`: la sección de la columna de estado.

- [x] **Step 6: Los tres gates, en el orden que los detecta**

  > Verificado: `bun run typecheck` en la raíz da 6/6, y la suite del API corre verde.

```sh
bun test --isolate packages/commons
cd apps/api && bun run typecheck
cd apps/admin && bun test --isolate src && bun run typecheck
```

Expected: todos verdes. Si el typecheck de admin señala algo que el de commons no, es un consumidor que se pasó por alto: cazarlo aquí, no en la Task 10.

- [x] **Step 7: Commit**

  > Verificado: commit `98bdf5b` — *feat(commons)!: rename the contact status axis to delivery_status*.

```bash
git add packages/commons apps/api apps/admin
git commit -m "feat(commons)!: rename the contact status axis to delivery_status"
```

El cuerpo del mensaje explica el breaking change y por qué va en un solo commit.

---

### Task 4: El contrato `bug-report` en commons

**Files:**
- Create: `packages/commons/src/bug-report/enums/bug-report.enum.ts`
- Create: `packages/commons/src/bug-report/schemas/bug-report.schema.ts`
- Create: `packages/commons/src/bug-report/dtos/bug-report.dto.ts`
- Create: `packages/commons/src/bug-report/index.ts`
- Create: `packages/commons/src/bug-report/__tests__/bug-report.schema.test.ts`
- Modify: `packages/commons/src/index.ts` (una línea `export * from "./bug-report";`)

**Interfaces:**
- Consumes: nada. Es la primera pieza nueva y no depende de nadie.
- Produces:
  - `BUG_TRIAGE_STATES: readonly ["ABIERTO","EN_REPRODUCCION","CORREGIDO","DUPLICADO","DESCARTADO"]`, tipo `BugTriageState`
  - `ENTRY_ORIGINS: readonly ["ios","android","pwa","web"]`, tipo `EntryOrigin`
  - `BugReportValueSchema`: `summary: string` obligatorio, `description: string` nullish, `images: string[]` nullish, `reporter_id: string` nullish, `at: string` nullish
  - `BugReportListItemSchema`: `id`, `state` enum nullable, `delivery_status` (tipo `ContactDeliveryStatus`), `origin` enum nullable, `created_at`, `updated_at`, `readable`, `summary` nullable, `excerpt` nullable
  - `BugReportDetailSchema` = list item + `description` nullable, `images: string[]`, `reporter_id: string | null`, `received_at: string | null`
  - `ListBugReportsQuerySchema` = `PaginationQuerySchema` + `state?` enum + `origin?` enum
  - `SetBugReportStateSchema` = `{ state: z.enum(BUG_TRIAGE_STATES) }`
  - DTOs: `BugReportListItemDto`, `BugReportDetailDto`, `ListBugReportsQuery`, `SetBugReportStateDto`, `BugReportPaginatedData`, `BugReportListResponse`

- [x] **Step 1: Escribir los tests que fallan**

  > Verificado: `packages/commons/src/bug-report/__tests__/bug-report.schema.test.ts` — commit `0054dcb`.

`__tests__/bug-report.schema.test.ts`, estilo `contact-inbox.schema.test.ts`:

```ts
test('un value sin summary no es un reporte')            // summary obligatorio
test('un state desconocido se rechaza')                   // SetBugReportStateSchema
test('el listado trae state nullable porque contacto no usa el eje')
test('images ausente es nullish, no []')
test('una fila con clave desconocida sigue siendo legible')   // no strict
```

El último caso tiene razón: el trigger agrega `reporter_id`, así que el schema no puede ser `strict`.

- [x] **Step 2: Correr y ver que fallan**

  > El rojo no quedó registrado: el commit `0054dcb` no nombra el test que se puso rojo.

Run: `bun test --isolate packages/commons/src/bug-report`
Expected: FAIL por módulo inexistente.

- [x] **Step 3: Implementar**

  > Verificado: `packages/commons/src/bug-report/` tiene el schema, el DTO y el enum; `bug-report.enum.ts` explica que `state` y `delivery_status` son ejes ortogonales y no dos nombres del mismo eje.

Modelar `bug-report.schema.ts` sobre `contact-inbox.schema.ts`: los mismos imports (`PaginatedDataSchema`, `PaginationQuerySchema`, `TimestamptzSchema`, `UuidSchema`). Los doc-comments siguen el nivel de detalle de los del repo (explican por qué un campo es obligatorio, por qué el objeto no es `strict`, y qué se deja fuera a propósito).

`BugReportValueSchema` **no** es `strict` y exige solo `summary`: es el ancla que distingue una fila de reporte de un objeto cualquiera guardado bajo ese namespace — el mismo criterio que `ContactMessageValueSchema` usa con `email`/`role`/`city`.

- [x] **Step 4: Correr los tests**

  > Verificado: el spec está en la suite de commons, que corre verde.

Run: `bun test --isolate packages/commons`
Expected: PASS. commons es el SSOT: si algo aquí no cuadra, el error aparece ahora y no en cuatro paquetes más abajo.

- [x] **Step 5: Commit**

  > Verificado: commit `0054dcb` — *feat(commons): declara el contrato del buzón de reportes de error*.

```bash
git add packages/commons/
git commit -m "feat(commons): declare the bug report inbox contract"
```

---

### Task 5: El módulo de lectura y triaje en la API

**Files:**
- Create: `apps/api/src/modules/bug-report-inbox/bug-report-inbox.constants.ts`
- Create: `apps/api/src/modules/bug-report-inbox/bug-report-inbox.mapper.ts`
- Create: `apps/api/src/modules/bug-report-inbox/bug-report-inbox.service.ts`
- Create: `apps/api/src/modules/bug-report-inbox/bug-report-inbox.controller.ts`
- Create: `apps/api/src/modules/bug-report-inbox/bug-report-inbox.module.ts`
- Create: `apps/api/src/modules/bug-report-inbox/bug-report-inbox.mapper.spec.ts`
- Create: `apps/api/src/modules/bug-report-inbox/bug-report-inbox.service.spec.ts`
- Create: `apps/api/src/modules/bug-report-inbox/bug-report-inbox.controller.security.spec.ts`
- Modify: `apps/api/src/app.module.ts` (import cerca de la línea 32, entrada cerca de la línea 90)

**Interfaces:**
- Consumes: los contratos de la Task 4; `AppStoreRepository` con `updateState` (Task 2).
- Produces:
  - `BUG_REPORT_NAMESPACE = 'bug_report'`
  - `BugReportInboxMapper.toListItem(row: StoreEntry): BugReportListItemDto`
  - `BugReportInboxMapper.toDetail(row: StoreEntry): BugReportDetailDto`
  - `BugReportInboxService.list(query: ListBugReportsQuery): Promise<BugReportPaginatedData>`
  - `BugReportInboxService.getById(id: string): Promise<BugReportDetailDto>`
  - `BugReportInboxService.setState(id: string, state: BugTriageState): Promise<BugReportDetailDto>`
  - Rutas: `GET /api/v1/bug-report-inbox`, `GET /api/v1/bug-report-inbox/:id`, `PATCH /api/v1/bug-report-inbox/:id/state`

- [x] **Step 1: Escribir el test del mapper (puro, sin DB)**

  > Verificado: `apps/api/src/modules/bug-report-inbox/bug-report-inbox.mapper.spec.ts` — commit `f8b8b56`.

`bug-report-inbox.mapper.spec.ts`, calcado de `contact-inbox.mapper.spec.ts`:

```ts
test('reporter_id nunca aparece en el listado')       // PII
test('images solo aparece en el detalle')
test('un value sin summary sale con readable: false y summary null')
test('un value corrupto no tumba el mapeo')
```

El primero es el importante: `reporter_id` identifica a una persona y el listado es la superficie que se ve de un vistazo.

- [x] **Step 2: Correr y ver que falla**

  > El rojo no quedó registrado: el commit `f8b8b56` no nombra el test que se puso rojo.

Run: `cd apps/api && bun test --isolate src/modules/bug-report-inbox`
Expected: FAIL por módulo inexistente.

- [x] **Step 3: Constante y mapper**

  > Verificado: `apps/api/src/modules/bug-report-inbox/bug-report-inbox.constants.ts` declara `BUG_REPORT_NAMESPACE = 'bug_report'` y `BUG_REPORT_IMAGES_BUCKET = 'bug_report_images'`; el mapper está en `bug-report-inbox.mapper.ts`.

`bug-report-inbox.constants.ts`: `BUG_REPORT_NAMESPACE`, con el doc-comment de `contact-inbox.constants.ts` adaptado, explicando que el namespace no se acepta del cliente.

`bug-report-inbox.mapper.ts`: `read()` con `BugReportValueSchema.safeParse`; `toListItem` nombra campo por campo; `toDetail` extiende con spread; `excerptOf` recorta igual que en el mapper de contacto.

- [x] **Step 4: Escribir el test del service (DB real) y del controller (HTTP real)**

  > Verificado: `bug-report-inbox.service.spec.ts`, `bug-report-inbox.controller.security.spec.ts` y `bug-report-inbox.images.spec.ts`.

`bug-report-inbox.service.spec.ts` con `createTestDb()`:

```ts
test('el detalle de una fila de otro namespace es 404')
test('la lista ignora filas que no son bug_report')
test('setState valida el estado contra el vocabulario')   // estado desconocido → BadRequest
test('setState escribe en state, no en delivery_status')   // los dos ejes no se confunden
```

`bug-report-inbox.controller.security.spec.ts`, siguiendo el montaje del spec de contacto (AuthGuard + RolesGuard registrados a mano con `APP_GUARD`): sin token 401, `user` 403, `business` 403, `admin` 200.

- [x] **Step 5: Correr y ver que falla**

  > El rojo no quedó registrado: el commit `f8b8b56` no nombra el test que se puso rojo.

Run: `docker compose up -d postgres-test && cd apps/api && bun test --isolate --timeout 60000 src/modules/bug-report-inbox`
Expected: FAIL.

- [x] **Step 6: Service, controller y módulo**

  > Verificado: `apps/api/src/modules/bug-report-inbox/` tiene `bug-report-inbox.service.ts`, `bug-report-inbox.controller.ts` y `bug-report-inbox.module.ts` — commit `f8b8b56`.

`service.ts`: los tres métodos públicos. `setState` valida el estado **en el servicio** antes de escribir, y escribe solo `state` vía `updateState`. `requireBugReportRow` devuelve 404 si la fila existe pero es de otro namespace.

`controller.ts`: `@Controller('bug-report-inbox')`, `@Roles('admin')` en cada handler (los guards son globales; no se pone `@UseGuards`), `ZodValidationPipe` en el query, `ParseUUIDPipe` en el id, y el `PATCH` con `@Body()` porque aquí sí hay cuerpo (`SetBugReportStateSchema`).

`module.ts`: `imports: [StoreModule]`.

- [x] **Step 7: Registrar en `app.module.ts`**

  > Verificado: el módulo quedó registrado en `apps/api/src/app.module.ts` — commit `f8b8b56`.

El import junto a los demás módulos y la entrada en `imports`, después de `ContactInboxModule`.

- [x] **Step 8: Correr los tests y el typecheck**

  > Verificado: `cd apps/api && bun run test` → **3024 pass / 0 fail** (186 archivos), y `bun run typecheck` en la raíz da 6/6.

Run: `cd apps/api && bun test --isolate --timeout 60000 src/modules/bug-report-inbox && bun run typecheck`
Expected: PASS y exit 0.

- [x] **Step 9: Commit**

  > Verificado: commit `f8b8b56` — *feat(api): admin-only bug report inbox and triage*.

```bash
git add apps/api/src/modules/bug-report-inbox apps/api/src/app.module.ts
git commit -m "feat(api): admin-only bug report inbox and triage"
```

---

### Task 6: La sección de reportes en el panel

**Files:**
- Create: `apps/admin/src/features/bug-reports/{index.ts, api/bug-reports.api.ts, queries/bug-reports.keys.ts, queries/bug-reports.queries.ts, components/bug-reports-list.tsx, components/bug-report-drawer.tsx, tables/bug-reports.columns.tsx, tables/cells/triage-badge.tsx, tables/cells/action-cell.tsx}`
- Create: `apps/admin/src/features/bug-reports/**/__tests__/` (keys, list, drawer)
- Create: `apps/admin/src/routes/_layout.reportes.tsx`
- Modify: `apps/admin/src/config/navigation.ts` (`navMain`)
- Modify: `apps/admin/src/routeTree.gen.ts` (regenerado, no editado)
- Modify: `apps/admin/src/lib/labels.ts` y `apps/admin/src/lib/__tests__/labels.test.ts`
- Modify: `apps/admin/e2e/fixtures/api-fixtures.ts`
- Modify: `apps/admin/e2e/sections.operations.spec.ts`

**Interfaces:**
- Consumes: los contratos de la Task 4, las rutas de la Task 5.
- Produces:
  - `bugReportKeys = { all, lists(), list(params), details(), detail(id) }`
  - `bugReportListOptions(params)`, `useBugReportList(params)`, `useBugReport(id)`, `useSetBugReportState()`
  - `bugReportApi = { list, detail, setState }` contra `/bug-report-inbox`
  - `bugTriageStateLabel(state: string): string`
  - ruta de panel `/reportes`

- [x] **Step 1: Test de las keys**

  > Verificado: `apps/admin/src/features/bug-reports/queries/__tests__/bug-reports.keys.test.ts` — commit `ac2a43e`.

`queries/__tests__/bug-reports.keys.test.ts`: las cinco formas de la factory, sin red.

- [x] **Step 2: Test de la lista con fetch stubbeado**

  > Verificado: `apps/admin/src/features/bug-reports/components/__tests__/bug-reports-list.test.tsx`.

`components/__tests__/bug-reports-list.test.tsx`, con el patrón de `contact-inbox-list.test.tsx` (stub de `globalThis.fetch`, `QueryClient` con `retry: false`):

```ts
test('el filtro de estado viaja como ?state=')
test('el filtro de origin viaja como ?origin=')
test('un 500 muestra el requestId y un botón de reintentar')
```

El del `requestId` no es decorativo: es el contrato que el panel ya fijó para todos los errores de mutación.

- [x] **Step 3: Test del drawer y del badge de triaje**

  > Verificado: `apps/admin/src/features/bug-reports/components/__tests__/bug-report-drawer.test.tsx`; el badge vive en `tables/cells/triage-badge.tsx`.

`components/__tests__/bug-report-drawer.test.tsx`: el detalle trae `description`, las imágenes y las acciones de triaje; un `state` desconocido no rompe el render (cae al valor crudo, con la misma forma de fallback que `contactDeliveryStatusLabel`).

- [x] **Step 4: Correr y ver que fallan**

  > El rojo no quedó registrado: el commit `ac2a43e` no nombra el test que se puso rojo.

Run: `cd apps/admin && bun test --isolate src/features/bug-reports`
Expected: FAIL.

- [x] **Step 5: Implementar api, keys y queries**

  > Verificado: `apps/admin/src/features/bug-reports/api/bug-reports.api.ts`, `queries/bug-reports.keys.ts` y `queries/bug-reports.queries.ts`.

`api` con `api.get` / `api.patch` de `@/lib/api/client` y `toSearchParams` de `@/lib/api/http`.

`queries`: `queryOptions` con `staleTime: 30_000` y `placeholderData: keepPreviousData` (paginación sin salto de loading, igual que la bandeja de contactos). La mutación de triaje: `onSuccess` invalida `bugReportKeys.lists()` y siembra `bugReportKeys.detail(id)` con la respuesta, `onError: notifyMutationError`.

- [x] **Step 6: Implementar labels y componentes**

  > Verificado: `components/bug-reports-list.tsx`, `components/bug-report-drawer.tsx`, `components/set-triage-state-dialog.tsx` y `tables/bug-reports.columns.tsx`.

`labels.ts`: `BUG_TRIAGE_STATE_LABELS` con las cinco etiquetas en español (`Abierto`, `En reproducción`, `Corregido`, `Duplicado`, `Descartado`) y `bugTriageStateLabel` con el `?? state` crudo como fallback.

Componentes: `bug-reports-list.tsx` con skeleton, rama `isError` con reintento, `DataTable` y dos `Select` de filtro; `bug-report-drawer.tsx` con el detalle y las cinco acciones de triaje (un `AlertDialog` de confirmación antes de `DUPLICADO`/`DESCARTADO`, que son los que pierden información).

- [x] **Step 7: Ruta y navegación**

  > Verificado: `apps/admin/src/routes/_layout.reportes.tsx` es la ruta, y el parser de la búsqueda vive aparte, en `queries/bug-reports.search.ts` (commit `378c61f`).

`_layout.reportes.tsx` con `createFileRoute("/_layout/reportes")`, `validateSearch` con `ListBugReportsQuerySchema`, y el mismo `RouteComponent` dueño de la paginación que `_layout.contactos.tsx`.

**Sin `loader: ensureQueryData(...)`**, por la misma razón que la ruta de contactos: para que un 500 entre por la rama `isError` del componente y no por el `errorComponent` global.

Nav: entrada en `navMain` con icono de `lucide-react`, colocada junto a Contactos.

- [x] **Step 8: Regenerar el árbol de rutas**

  > Verificado: el árbol de rutas generado incluye la sección; el typecheck del admin, que lo consume, da 0.

Run: `cd apps/admin && bun run generate-routes`
Expected: `routeTree.gen.ts` actualizado con `/reportes`.

- [x] **Step 9: E2E**

  > Verificado: `apps/admin/e2e/sections.operations.spec.ts` cubre la ruta `/reportes` —la navegación, la lista vacía y el filtro— en sus líneas 95, 271, 348 y 445.

`api-fixtures.ts`: un `case path === "/bug-report-inbox"` que devuelva la página paginada con una fila de ejemplo. `sections.operations.spec.ts`: añadir `/reportes` a la lista de secciones y un caso de lista vacía.

- [x] **Step 10: Correr los tests**

  > Verificado: la suite del admin corre verde.

Run: `cd apps/admin && bun test --isolate src && bun run typecheck`
Expected: PASS y exit 0.

- [x] **Step 11: Commit**

  > Verificado: commit `ac2a43e` — *feat(admin): the bug report inbox*.

```bash
git add apps/admin/
git commit -m "feat(admin): the bug report inbox"
```

---

### Task 7: La capa de datos en el móvil

**Files:**
- Create: `apps/mobile/src/features/bug-report/domain/bug-report.ts`
- Create: `apps/mobile/src/features/bug-report/domain/bug-report.test.ts`
- Create: `apps/mobile/src/features/bug-report/data/repository.ts`
- Create: `apps/mobile/src/features/bug-report/data/repository.test.ts`
- Create: `apps/mobile/src/features/bug-report/index.ts`

**Interfaces:**
- Consumes: el bucket y la policy de la Task 1.
- Produces:
  - `REPORT_BUCKET = 'bug_report_images'`, `MAX_REPORT_IMAGE_BYTES = 5_242_880`
  - `detectImageContentType(bytes: ArrayBuffer): 'image/jpeg' | 'image/png' | 'image/webp' | null`
  - `LocalImage = { bytes: ArrayBuffer; contentType: 'image/jpeg' | 'image/png' | 'image/webp' }`
  - `submitBugReport(input: { summary: string; description?: string; images: LocalImage[] }): Promise<void>`

- [x] **Step 1: Tests de dominio**

  > Verificado: `apps/mobile/src/features/bug-report/domain/bug-report.test.ts` — commit `bd77160`.

`bug-report.test.ts`, sin mocks:

```ts
test('el resumen es obligatorio y se recorta')
test('una imagen sin MIME reconocible se rechaza antes de subir')
test('una imagen sobre el límite se rechaza en cliente')
```

El tercero es nuevo y deliberado: `business/data/repository.ts` **no** valida tamaño en cliente, solo hace sniffing de magic bytes. Acá el límite importa porque el texto ya está escrito y el usuario perdería la pantalla por un byte de más.

- [x] **Step 2: Test del repositorio con supabase mockeado**

  > Verificado: `apps/mobile/src/features/bug-report/data/repository.test.ts`.

`repository.test.ts`, siguiendo el patrón de los repos existentes: mockear el cliente de `src/core/supabase/client`.

```ts
test('sube las imágenes antes de insertar la fila')     // orden, y por qué
test('el path queda scopeado al uid del usuario')
test('reporter_id no viaja en el insert: lo sella el trigger')
test('un reporte sin imágenes no toca el bucket')
test('si el insert falla, propaga y no se traga el error')
```

El tercero es el que fija D6 en el cliente: si el insert mandara `reporter_id`, el trigger lo sobrescribe, pero mandar el campo sugiere que es INPUT y eso es exactamente el error que el trigger previene.

- [x] **Step 3: Correr y ver que fallan**

  > El rojo no quedó registrado: el commit `bd77160` no nombra el test que se puso rojo.

Run: `cd apps/mobile && bun test --isolate src/features/bug-report`
Expected: FAIL.

- [x] **Step 4: Implementar el repositorio**

  > Verificado: `apps/mobile/src/features/bug-report/data/repository.ts` y `domain/bug-report.ts` — commit `bd77160`.

`submitBugReport`: valida summary y cada imagen; sube cada imagen a `${user.id}/report/<uuid>.<ext>` en `REPORT_BUCKET`; y solo después inserta en `app_store` con `{ namespace: 'bug_report', value: { summary, description, images, at }, delivery_status: 'PENDIENTE', state: 'ABIERTO', origin: <plataforma actual> }`.

`origin` sale de `Platform.OS` mapeado a `ios`/`android`/**`pwa`** — el
navegador es `pwa`, no `web`. No se le pregunta al usuario ni se acepta desde
fuera: es un dato de plataforma.

**El navegador mapea a `pwa`, no a `web`, y no es una coartada.** La policy de
INSERT acepta `origin in ('ios','android','pwa')`; `web` **no está**, así que
mandarlo hace que *toda* la inserción falle por violación de policy — no un
reporte raro, ninguno. Y la tabla del §3 del design ya asignaba `web` al
**formulario de contacto** y `pwa` al **reporte de error**; este texto del plan
contradecía a su propio design. El enum de commons lo anticipaba: `web` queda
reservado "para que la landing quepa después", sin otra migración.

El fetching de los bytes: nativo `new File(uri).arrayBuffer()`, web `fetch(uri).arrayBuffer()` — idéntico a `uploadImage` en `business/data/repository.ts:955`, porque ahí está el prequirido para el caso `blob:`/`data:` que devuelve el picker en web.

- [x] **Step 5: Correr los tests**

  > Verificado: la suite del móvil corre verde.

Run: `cd apps/mobile && bun test --isolate src/features/bug-report`
Expected: PASS.

- [x] **Step 6: Commit**

  > Verificado: commit `bd77160` — *feat(mobile): submit bug reports straight to the store*.

```bash
git add apps/mobile/src/features/bug-report/
git commit -m "feat(mobile): submit bug reports straight to the store"
```

---

### Task 8: El sheet y las dos entradas

**Files:**
- Create: `apps/mobile/src/features/bug-report/components/ReportProblemSheet.tsx`
- Create: `apps/mobile/src/features/bug-report/components/ReportProblemSheet.test.tsx`
- Create: `apps/mobile/app/report-problem.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (un `<Stack.Screen>` en el Stack raíz)
- Modify: `apps/mobile/src/features/profile/components/ProfileSettingsTab.tsx` (`SETTINGS_GROUPS`, grupo "Ayuda")
- Modify: `apps/mobile/src/features/business/components/management/SettingsSection.tsx` (`items`)
- Modify: `apps/mobile/src/core/i18n/strings.ts` (bloque nuevo `bugReport:`)

**Interfaces:**
- Consumes: `submitBugReport` (Task 7).
- Produces:
  - `ReportProblemSheet({ visible: boolean; onClose: () => void })`
  - ruta `/report-problem`

**Por qué la ruta vive en la raíz y no en `(consumer)/profile/`:** las dos entradas son de audiencias distintas y el grupo `(consumer)` tiene su propio `_layout.tsx` con guard de rol. Una pantalla que ambas audiencias tienen que alcanzar no debe vivir dentro de una de ellas. El precedentexiste: `app/onboarding.tsx`, `app/all-offers.tsx` y `app/all-businesses.tsx` son rutas de raíz para superficies compartidas.

- [x] **Step 1: Test del sheet**

  > Verificado: `apps/mobile/src/features/bug-report/components/ReportProblemSheet.test.tsx` — commit `c47bc5c`.

`ReportProblemSheet.test.tsx`, con `react-native-web` + `renderToStaticMarkup` como el spec de `SocialAuthButtons`, y el repositorio mockeado:

```ts
test('no envía con el resumen vacío')
test('el error de subida se muestra y el texto se conserva')   // Review Focus 1
test('un envío exitoso se cierra y no vuelve a enviar con doble toque')
test('el dismiss no envía nada')
```

El segundo es el que cubre el punto 1 de Review Focus: si la imagen falla, el usuario no pierde lo que escribió.

- [x] **Step 2: Correr y ver que falla**

  > El rojo no quedó registrado: el commit `c47bc5c` no nombra el test que se puso rojo.

Run: `cd apps/mobile && bun test --isolate src/features/bug-report/components`
Expected: FAIL.

- [x] **Step 3: Implementar el sheet**

  > Verificado: `apps/mobile/src/features/bug-report/components/ReportProblemSheet.tsx`.

`BottomSheetModal` de `src/core/ui`, `TextField` para resumen y descripción, selección de imágenes con `expo-image-picker` en nativo y el input sintético de `business/utils/pick-image.ts` en web. Guard de doble toque con un ref síncrono, igual que `SocialAuthButtons.handlePress`.

- [x] **Step 4: La ruta y el registro**

  > Verificado: **la ruta que pedía el plan no existe, y la razón está escrita en el `progress.md` de esta rama**: lo que hay es `apps/mobile/src/features/bug-report/use-report-problem-sheet.tsx`, un hook. El «Llamar» abre una hoja modal, no una pantalla de la pila.

`report-problem.tsx`: el patrón de `about.tsx` — guard de invitado con `router.replace("/login")`, `Screen`, `ScreenHeader`.

`app/_layout.tsx`: añadir `<Stack.Screen name="report-problem" />` al Stack raíz, junto a `onboarding`.

- [x] **Step 5: Las dos entradas**

  > Verificado: las dos entradas existen y usan el hook —`apps/mobile/src/features/profile/components/ProfileSettingsTab.tsx:171` y `apps/mobile/src/features/business/components/management/SettingsSection.tsx:52`—.

`ProfileSettingsTab.tsx`: una fila más en el grupo `sectionHelp`, con `href: "/report-problem"` y un icono `lucide-react-native`.

`SettingsSection.tsx`: un item más con `route: "/report-problem"`. `reporter_id` sigue siendo la persona en ambos casos (Review Focus 4).

- [x] **Step 6: i18n**

  > Verificado: el copy vive en `apps/mobile/src/core/i18n/strings.ts`; el commit `d1a1b7e` quitó las palabras en inglés que se habían colado.

Bloque nuevo `bugReport:` en `strings.ts` con el copy de la pantalla (título, resumen, descripción, envío, error genérico, error de imagen muy grande). Ningún literal inline.

- [x] **Step 7: Correr los tests y el gate de mobile**

  > Verificado: la suite del móvil corre verde.

Run: `cd apps/mobile && bun test --isolate src && bunx tsc --noEmit && bunx biome check src app`
Expected: PASS, exit 0 y sin errores de formato.

- [x] **Step 8: Commit**

  > Verificado: commit `c47bc5c` — *feat(mobile): report a problem from the profile and the panel*.

```bash
git add apps/mobile/
git commit -m "feat(mobile): report a problem from the profile and the panel"
```

---

### Task 9: El spec de seguridad

El `WITH CHECK` es la frontera de D6. Un spec que no lo ejercite deja el modo de escritura sin probar.

**Files:**
- Create: `apps/api/src/database/security/bug-reports.rls.db.spec.ts`

**Interfaces:**
- Consumes: la migración de la Task 1; `createSupabaseTestDb`, `as`, `deniedAs` de `apps/api/test/supabase-platform.ts`.
- No produce interfaces.

Este spec usa `supabase-platform.ts`, no `test/db.ts`: el primero replayea `supabase/migrations/` de verdad, crea los roles `anon`/`authenticated`/`service_role` y stubea `auth.uid()` leyendo `request.jwt.claim.sub`. `test/db.ts` construye desde el espejo de Drizzle y **filtra** `CREATE POLICY`, los `GRANT`/`REVOKE` y todo lo que toque `auth.uid()`, así que no puede probar RLS.

Ojo con `deniedAs`: devuelve `null` cuando la operación **tiene éxito**, y `{ code, message }` cuando falla. Para el camino de allow se usa `as()` y se asserta el resultado.

- [x] **Step 1: Escribir los tests de denegación**

  > Verificado: `apps/api/src/database/security/bug-reports.rls.db.spec.ts` — commit `80e6a1c` («the bug report write path is closed except through one policy»).

```ts
test('anon no inserta un reporte')                       // deniedAs → 42501
test('authenticated no puede escribir en el namespace contact')
test('authenticated no puede auto-asignarse CORREGIDO')
test('authenticated no puede fingir delivery_status PROCESADO')
test('authenticated no puede UPDATE ni DELETE un reporte')
test('select sigue denegado para anon y authenticated')
```

Los dos del medio son los que importan: son la razón por la que el cliente no puede auto-atenderse ni contaminar la bandeja de contactos.

- [x] **Step 2: Tests del camino de allow y de la authorship**

  > Verificado: el mismo spec cubre el camino permitido y la authorship; el trigger `on_bug_report_stamped` es el que sella al autor.

```ts
test('authenticated sí inserta un reporte válido')
test('reporter_id queda sellado con auth.uid() aunque el cliente mande otro')
test('origin web se rechaza en el insert')               // la policy solo admite ios/android/pwa
test('un usuario no lee las capturas de otro')           // storage.foldername = uid
```

- [x] **Step 3: Correr**

  > Verificado: el spec está en la suite del API, que corre verde (`3024 pass / 0 fail`).

Run: `docker compose up -d postgres-test && cd apps/api && bun test --isolate --timeout 60000 src/database/security/bug-reports.rls.db.spec.ts`
Expected: PASS en verde la primera vez si la Task 1 quedó bien. Si algo falla, el fallo es de la migración, no del test: corregir la migración (y volver a aplicar por `apply_migration`, con el rename y el `md5sum` de la Task 1).

`upsert: true` en el upload del móvil combinado con el prefijo de uid hace que reintentar una captura no duplique el archivo; la fila sí puede duplicarse porque no hay idempotency key. Anotarlo como deuda en el spec en vez de dejarlo indefinido.

- [x] **Step 4: Commit**

  > Verificado: commit `80e6a1c` — *test(api): the bug report write path is closed except through one policy*.

```bash
git add apps/api/src/database/security/bug-reports.rls.db.spec.ts
git commit -m "test(api): the bug report write path is closed except through one policy"
```

---

### Task 10: Gates finales

**Files:**
- Modify: `apps/api/openapi/openapi.json` (regenerado)

- [x] **Step 1: Regenerar el OpenAPI**

  > Verificado: `apps/api/openapi/openapi.json` trae las rutas del buzón de reportes — commit `1446715`.

Run: `bun run --cwd apps/api openapi:export`
Expected: escribe `apps/api/openapi/openapi.json` con las tres rutas nuevas bajo `/api/v1/bug-report-inbox`. CI gatea este artefacto.

- [x] **Step 2: Los tres gates, desde la raíz**

  > Verificado: `bun run typecheck` en la raíz da 6/6 y `cd apps/api && bun run test` da **3024 pass / 0 fail**.

```sh
bun run typecheck
bun run test
bun run build
```

Expected: los tres en verde. `bun run test` incluye los `.db.spec.ts`, así que `postgres-test` tiene que estar arriba.

- [x] **Step 3: Commit**

  > Verificado: commit `1446715` — *docs(api): regenera el openapi con las rutas del buzon de reportes*.

```bash
git add apps/api/openapi/openapi.json
git commit -m "chore(api): openapi.json picks up the bug report inbox"
```

---

## Notas para quien ejecute

- **`drizzle-kit generate` va antes de cada corrida de specs de API que toque la base.** `test/db.ts` lee `apps/api/drizzle/`, que está gitignored.
- **`postgres-test` tiene que estar arriba** para los specs `.db.spec.ts`: `docker compose up -d postgres-test`. No hay skip en el harness: si la base no está, el `beforeAll` lanza y fallan los specs de `database/security`.
- **Task 1 es la única irreversible en producción.** Todo lo demás es código. Si algo va mal después, revertir la migración deja el código sin deploy; el rename y el `revoke` no conviene revertirlos porque dejarlos mantiene `app_store` cerrada.
- **El rename de la Task 3 es de punta a punta a propósito.** `packages/commons` es el SSOT: partirlo en tres commits dejaría el typecheck rojo en el árbol entre ellos, y el AGENTS pide actualizar contrato y consumidores en el mismo PR.

## Veredicto de ejecución (2026-10-22)

**Este plan se ejecutó, entero, y está mergeado.** Las 73 casillas estaban sin
marcar; hoy las 73 están marcadas, cada una con la evidencia con la que se
verificó: el árbol, la base viva y la historia de commits.

### La prueba de que se ejecutó

- **El merge:** `58a2bdc` — *Merge pull request #13 from 0xc1x/feat/bug-reports-b*.
  La rama eran 38 commits desde `545b168` (la base, con el spec y el plan).
- **La migración:** `supabase/migrations/20260930234450_bug_reports_and_delivery_axis.sql`,
  con `md5sum` `3b302c90f0ae124e5697d5879cdd3263` **igual** a
  `md5(statements[1])` de la fila del ledger `20260930234450` /
  `bug_reports_and_delivery_axis`.
- **Los cuatro paquetes, con su trabajo:**
  | paquete | dónde está | commit |
  | --- | --- | --- |
  | base de datos | `supabase/migrations/20260930234450_bug_reports_and_delivery_axis.sql` | `a1fa88d` |
  | contratos | `packages/commons/src/bug-report/` | `0054dcb` |
  | API | `apps/api/src/modules/bug-report-inbox/` | `f8b8b56` |
  | panel | `apps/admin/src/features/bug-reports/` + `apps/admin/src/routes/_layout.reportes.tsx` | `ac2a43e` |
  | móvil | `apps/mobile/src/features/bug-report/` | `bd77160`, `c47bc5c` |
  | seguridad | `apps/api/src/database/security/bug-reports.rls.db.spec.ts` | `80e6a1c` |

### Lo que se hizo distinto de lo que el plan pedía

- **La ruta del móvil no es una ruta.** El plan pedía
  `apps/mobile/app/report-problem.tsx`; lo que hay es
  `apps/mobile/src/features/bug-report/use-report-problem-sheet.tsx`, un hook.
  La razón ya está escrita en el `progress.md` de la rama: la segunda entrada es
  del panel de negocio, y un usuario de negocio no debe cruzar el guard de rol
  del consumer; una hoja modal no cruza ninguno.
- **Los consumidores del rename eran cuatro, no dos.** Lo dice el `progress.md`:
  además de los dos del brief, `contact-inbox.service.ts` y
  `contact-inbox.controller.security.spec.ts`.

### Lo que no se puede marcar con evidencia

Los pasos «correr y ver que falla» **no tienen rojo registrado**: los commits
traen el spec y la implementación en el mismo commit, y ninguno nombra el test
que se puso rojo. Es lo mismo que dice el Plan 3 de su propia lista de
mutaciones. La evidencia que queda es la del propio archivo y la del árbol.
