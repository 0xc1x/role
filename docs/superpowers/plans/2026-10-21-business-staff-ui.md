# Plan 4 — La interfaz de los accesos de staff

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un dueño pueda dar de alta, administrar y cortar los accesos de su
equipo desde el panel del móvil, que un empleado pueda entrar con su alias y su
PIN, y que el admin de plataforma pueda supervisar el equipo de cualquier negocio.

**Architecture:** El Plan 2 dejó los contratos y las nueve rutas de la API; el
Plan 3 dejó el alcance por sucursal y la transferencia. Ninguna de las dos tiene
pantalla. Este plan construye la capa que falta: un cliente HTTP **nuevo** en el
móvil (excepción consciente a ADR-0002, ADR-0013 §A.1) que consume esas rutas, la
sección Equipo del panel, y las pestañas del admin. No hay migraciones: toda la
base de datos que este plan necesita ya existe.

**Tech Stack:** Expo SDK 57 + expo-router + TanStack Query + TypeScript estricto
(móvil); TanStack Start + shadcn/Base UI (admin); NestJS 11 (API, sólo una ruta
nueva); `@0xc1x/role-commons` como SSOT de contratos; `bun:test` en las tres apps.

**Spec:** `docs/superpowers/specs/2026-10-13-business-staff-access-design.md`
(§9.1–§9.5 móvil, §10 admin, §11 verificación) y
`docs/decisions/ADR-0013-accesos-de-staff-por-sucursal.md` (§A.1, la excepción).

## Global Constraints

- El móvil consume Supabase directo (ADR-0002) **salvo** administrar quién opera,
  que pasa por la API: es la excepción del ADR-0013 y no se generaliza a otras
  consultas del panel.
- Nada de literales inline en `app/**` del móvil: todo string va a
  `src/core/i18n/strings.ts` (hay un test de fuente que lo verifica). Capas:
  componente → hook (`use*`) → repo (`data/`) → Supabase o API.
- El móvil no redefine entidades de commons: sólo proyecciones y view models.
- `bun run typecheck`, `bun run test` y `bun run build` en la raíz tienen que
  quedar verdes. El gate autoritativo del móvil es `bunx tsc --noEmit`.
- Conventional commits. Nunca `Co-Authored-By` ni atribución de IA.
- RLS sigue siendo la frontera de datos: la UI **se adelanta** al servidor para no
  ofrecer botones que fallan, nunca para conceder algo que el servidor niegue.
  Donde RLS no niega (el `UPDATE` de `business_locations` para un `staff`, §9.3),
  el filtro de UI es la única barrera para un cliente que hable directo.
- Los códigos `R0001`/`R0002`/`R0004` no existen en el móvil ni en admin: el API
  los traduce a 422 con prosa en español, y esa prosa es la que se muestra.

## Review Focus

- **El panel de un `staff`**: hoy un empleado no ve ningún negocio (la lectura es
  `role='owner'`). Al abrirlo ve Productos y Pedidos —su trabajo— y **no** ve
  configuración; y no puede renombrar su propia sucursal por PostgREST porque el
  botón no existe.
- **Un corte de emergencia que no corta al dueño**: la operación es masiva y el
  dueño no se puede desactivar (`R0002`); fallar por su fila volvería inútil el
  botón, y saltearlo en silencio tiene que estar dicho en la respuesta.
- **El "¿olvidaste tu contraseña?" de un empleado**: el identificador de un acceso
  no tiene bandeja detrás. Preguntarlo con `isRoleEcAlias` en vez de
  `!isDeliverableAlias` manda el correo a un buzón de Rolé y promete una
  recuperación que el §8 bloquea a propósito.
- **El PIN después del alta**: sólo existe en la respuesta del alta o de la
  rotación. Recargar, cerrar la hoja o volver atrás no lo recupera; la pantalla
  tiene que decirlo antes de perderlo.
- **Un gerente que corta lo que no ve**: el corte y la lista se filtran por alcance
  en la base, no en la vista. Si la UI ofrece un botón para un acceso fuera de
  alcance, la escritura se rechaza y el operador no sabe por qué.

---

### Task 1: El cliente HTTP del panel

**Files:**
- Create: `apps/mobile/src/core/api/client.ts`
- Create: `apps/mobile/src/core/api/errors.ts`
- Test: `apps/mobile/src/core/api/client.test.ts`, `apps/mobile/src/core/api/errors.test.ts`
- Modify: `apps/mobile/src/core/config/env.ts` (documentar que ahora sí se consume), `apps/mobile/.env.example`

**Interfaces:**
- Consumes: `env.EXPO_PUBLIC_API_URL` (ya declarada en `src/core/config/env.ts` y hoy sin ningún consumidor), `supabase` (`@/src/core/supabase/client`), `AppError`/`Errors` (`@/src/core/error/app-error`).
- Produce: `apiRequest<T>(method: HttpMethod, path: string, options?: { body?: unknown }): Promise<T>` y `api = { get, post, patch, delete }`; `fromApiResponse(response: Response, path: string): Promise<never>`.

- [ ] **Step 1: El mapeo de estados, con su test**

`errors.test.ts`: tabla de estados → `AppError.kind`. 401→`unauthorized`,
403→`forbidden`, 404→`not_found`, 409→`conflict`, 400→`validation`,
422→`business_rule` (es el estado con el que el API dice "el plan no admite otro
acceso"), 5xx→`unknown`, sin respuesta→`network`. Assertions: el `code` es
`String(status)`; el `message` es el `message` del sobre del API cuando viene, y el
fallback cuando no.

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/core/api/errors.test.ts`
Expected: FAIL — `Cannot find module '@/src/core/api/errors'`

- [ ] **Step 3: `errors.ts`**

`fromApiResponse` lee el sobre (`{ statusCode, message, error, path, requestId }`) y
lanza `Errors[kind](message, String(response.status), { path, requestId })`. Si el
cuerpo no es JSON, usa `response.statusText`.

- [ ] **Step 4: El test del cliente**

`client.test.ts`, con `mock.module` del cliente de Supabase y de `env`:
`POST /businesses/x/staff` manda `Authorization: Bearer <access_token>` y
`content-type: application/json`; un 204 devuelve `undefined` sin parsear; sin
sesión lanza `unauthorized` **sin** hacer el fetch; con `EXPO_PUBLIC_API_URL` vacía
lanza `unknown` con el mensaje `"Falta EXPO_PUBLIC_API_URL"`.

- [ ] **Step 5: `client.ts`**

`apiRequest` compone `${env.EXPO_PUBLIC_API_URL}${path}`, obtiene el token con
`supabase.auth.getSession()`, y **no** reintenta ni refresca: el refresh de sesión
ya lo hace supabase-js.

- [ ] **Step 6: Correr los tests y verlos pasar**

Run: `cd apps/mobile && bun test --isolate src/core/api`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/core/api apps/mobile/src/core/config/env.ts apps/mobile/.env.example
git commit -m "feat(mobile): cliente HTTP del API para administrar el equipo"
```

---

### Task 2: El sello de sesión al entrar

**Files:**
- Create: `apps/mobile/src/features/auth/data/staff-session.ts`
- Test: `apps/mobile/src/features/auth/data/staff-session.test.ts`
- Modify: `apps/mobile/src/features/auth/data/repository.ts` (después de un login exitoso)

**Interfaces:**
- Consumes: `api.post` (Task 1), `StaffSessionState` de `@0xc1x/role-commons`.
- Produce: `stampStaffSession(businessId?: string): Promise<StaffSessionState | null>` — devuelve `null` cuando no se pudo sellar, **nunca lanza**.

- [ ] **Step 1: El test**

`stampStaffSession()` llama `POST /staff/session` sin cuerpo cuando no hay negocio,
y con `{ business_id }` cuando lo hay; un fallo de red devuelve `null` y **no**
propaga (el login ya ocurrió y no se deshace por esto); con `EXPO_PUBLIC_API_URL`
vacía devuelve `null` sin llamar.

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/auth/data/staff-session.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: `staff-session.ts`**

Envuelve la llamada en `try/catch`; en el `catch`, un `console.warn` con el evento
`staff_session_stamp_failed`.

- [ ] **Step 4: Enganchar el sello al login**

En `authRepository.signInWithEmail` (`data/repository.ts`), después de obtener la
sesión y antes de devolver el perfil: `await stampStaffSession()` — sin negocio,
porque el panel todavía no eligió. El servicio del API ya resuelve el caso de una
sola membresía, y para quien no es miembro no escribe nada
(`staff.service.ts:214-243`).

- [ ] **Step 5: El test del enganche**

En `repository.test.ts` del auth: un login exitoso emite exactamente un
`POST /staff/session`; un login fallido no lo emite.

- [ ] **Step 6: Correr los tests y verlos pasar**

Run: `cd apps/mobile && bun test --isolate src/features/auth`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/auth
git commit -m "feat(mobile): sellar la sesión de staff al entrar"
```

---

### Task 3: El login recuerda el identificador y no promete un correo que no llega

**Files:**
- Create: `apps/mobile/src/features/auth/data/login-history.ts`
- Test: `apps/mobile/src/features/auth/data/login-history.test.ts`
- Modify: `apps/mobile/app/(auth)/login.tsx` (chips, diálogo condicional, `autoComplete`)
- Modify: `apps/mobile/src/core/i18n/strings.ts`
- Test: `apps/mobile/src/features/auth/presentation/login-staff.test.tsx`

**Interfaces:**
- Consumes: `isDeliverableAlias` de `@0xc1x/role-commons`, `AsyncStorage`, `strings.auth`.
- Produce: `readLoginIdentifiers(): Promise<string[]>`, `rememberLoginIdentifier(identifier: string): Promise<void>`, `clearLoginIdentifiers(): Promise<void>`.

- [ ] **Step 1: El test del almacén**

Guarda como máximo los **tres** últimos, sin duplicados y sin distinguir
mayúsculas (`Ana@X.com` reemplaza a `ana@x.com`); un JSON corrupto en la clave
devuelve `[]` en vez de lanzar; el registro **no** tiene ningún campo de PIN
(assertion sobre las claves del objeto escrito en AsyncStorage: es la promesa del
§9.1 y una assertion la sostiene).

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/auth/data/login-history.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: `login-history.ts`**

Clave `role.login.identifiers`. Sólo identificadores, nunca secretos.

- [ ] **Step 4: El test del diálogo condicional**

Tres casos, con un doble del repositorio de auth: `cajero@mibarrio.role.ec` (sin
bandeja detrás) muestra el aviso de que las cuentas de negocio no usan correo y
**no llama** a `requestPasswordReset`; `ana@rolé.ec` (el ápice, que sí es un buzón
de Rolé) y `ana@dominio.com` (dominio propio) siguen el flujo normal de hoy.

- [ ] **Step 5: Correr y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/auth/presentation/login-staff.test.tsx`
Expected: FAIL

- [ ] **Step 6: La condición, con su porqué**

El diálogo se decide con **`!isDeliverableAlias(identifier)`**, no con
`isRoleEcAlias`: la pregunta es "¿hay una bandeja detrás?", y para el ápice las dos
funciones dan respuestas distintas a propósito (`business-member.schema.ts:142-153`
lo dice: usar la equivocada deja pasar un `forgot-password` que el §8 bloquea). El
comentario del llamador tiene que nombrar esa advertencia para que un refactor no
la borre.

- [ ] **Step 7: Los chips y el resto del §9.1**

Los chips con los identificadores usados en este dispositivo llenan el campo y
llevan el foco al PIN; `rememberLoginIdentifier` se llama tras un login exitoso.
Se quitan `autoComplete="email"`/`textContentType="emailAddress"` del campo de
identificador (líneas 94-97) para que el sistema no ofrezca el correo personal del
empleado encima de lo que escribe. **Excluido a propósito**: el botón de escanear
la tarjeta — `PickupScannerSheet` está construido alrededor del contrato del pickup
(`parsePickupQr`) y extender ese contrato es trabajo de la feature de pedidos.

- [ ] **Step 8: Correr y verificar, y commitear**

Run: `cd apps/mobile && bun test --isolate src && bun run typecheck`
Expected: PASS

```bash
git add apps/mobile
git commit -m "feat(mobile): el login recuerda el identificador y no promete correo"
```

---

### Task 4: El panel sabe quién opera el negocio

**Files:**
- Modify: `apps/mobile/src/features/business/data/repository.ts:352` (`getBusinessesByOwnerId` → `getOperatedBusinesses`)
- Modify: `apps/mobile/src/features/business/domain/business.ts`
- Modify: `apps/mobile/src/features/business/hooks.ts:24` (`useBusinesses`)
- Test: `apps/mobile/src/features/business/data/repository.test.ts:359-425`
- Test: `apps/mobile/e2e/07-business-management.spec.ts:74-119`, `apps/mobile/e2e/fixtures.ts`

**Interfaces:**
- Consumes: `BusinessMemberRole` de commons.
- Produce: `getOperatedBusinesses(userId: string): Promise<OperatedBusiness[]>` con `type OperatedBusiness = Business & { role: BusinessMemberRole }`; `useBusinesses(ownerId)` conserva su firma y pasa a devolver `OperatedBusiness[] | undefined`.

- [ ] **Step 1: Reescribir el test del repositorio**

El caso actual afirma `role=eq.owner`; el nuevo afirma
`role=in.(owner,manager,staff)`, `status=eq.active`, `deleted_at=is.null`, y que
una persona con fila en dos negocios recibe los dos, cada uno con **su** rol.

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/business/data/repository.test.ts`
Expected: FAIL — sigue emitiendo `role=eq.owner`

- [ ] **Step 3: Renombrar y extender la lectura**

`business_members` → `businesses`, adjuntando el rol de la membresía al negocio.
Sigue siendo Supabase directo: la policy `"Members can view own membership"`
alcanza para leer la fila propia. El comentario de la función tiene que decir por
qué ya no es sólo del dueño: un cajero necesita el panel para cobrar.

- [ ] **Step 4: Actualizar el e2e**

El e2e afirma la URL exacta de la petición; pasa a
`role=in.%28owner%2Cmanager%2Cstaff%29` y sigue afirmando que `business_ownership`
no se lee nunca.

- [ ] **Step 5: Correr y verificar**

Run: `cd apps/mobile && bun test --isolate src && bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/business apps/mobile/e2e
git commit -m "feat(mobile): el panel resuelve los negocios que se operan, con su rol"
```

---

### Task 5: El panel se pinta según el rol

**Files:**
- Create: `apps/mobile/src/features/business/domain/panel-role.ts`
- Test: `apps/mobile/src/features/business/domain/panel-role.test.ts`
- Modify: `apps/mobile/app/(business)/management.tsx` (pasa el rol), `src/features/business/components/management/GestionContent.tsx` (recibe y reparte el rol)
- Modify: `src/features/business/components/management/SettingsSection.tsx`, `QuickActionsGrid.tsx`
- Test: `apps/mobile/src/features/business/components/management/GestionContent.roles.test.tsx`

**Interfaces:**
- Produce: `type PanelMinRole = "owner" | "manager" | "staff"` y `meetsMinRole(role: BusinessMemberRole | null, minRole: PanelMinRole): boolean`; `GestionContent({ businessId, role }: { businessId: string; role: BusinessMemberRole })` y las tres secciones reciben `role` por prop.

- [ ] **Step 1: El test del helper**

`meetsMinRole('owner','manager')` es `true`; `meetsMinRole('staff','manager')` es
`false`; `meetsMinRole(null,'manager')` es **`false`** (fail closed: sin rol no se
ofrece configuración); el orden es `owner > manager > staff`.

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/business/domain/panel-role.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: `panel-role.ts`**

El helper, con el porqué de fail-closed en el docblock (§9.3).

- [ ] **Step 4: El test de render por rol**

`GestionContent.roles.test.tsx` con `renderToStaticMarkup` y `mock.module` de
hooks/UI, tres casos: `owner` ve el botón de editar el negocio, la sección de
sucursales y las tiles de métricas y cupones; `staff` **no** ve ninguno de los
cuatro y sí ve Pedidos; `manager` ve sucursales y equipo pero no el botón de
editar el negocio.

- [ ] **Step 5: Repartir el rol y aplicar el filtro**

`management.tsx` pasa `business.role` a `GestionContent`, que lo reparte a
`SettingsSection` y `QuickActionsGrid`. Cada fila, tile y bloque declara su
`minRole` y se filtra con `meetsMinRole`. Mínimos: editar negocio `owner`;
sucursales `owner`; métricas `owner`; cupones `owner`; notificaciones `owner`;
ayuda y reseñas `staff`; **Equipo `manager`**. La fila y la tarjeta de "Equipo y
accesos" las monta Task 7, que es donde existe la ruta a la que apuntan.

- [ ] **Step 6: Correr y verificar**

Run: `cd apps/mobile && bun test --isolate src && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): el panel oculta la configuración que el rol no alcanza"
```

---

### Task 6: Los accesos del equipo, por el API

**Files:**
- Create: `apps/mobile/src/features/business/data/staff.ts`
- Test: `apps/mobile/src/features/business/data/staff.test.ts`
- Modify: `apps/mobile/src/features/business/hooks.ts`

**Interfaces:**
- Consumes: `api.get/post/patch/delete` (Task 1), y de commons `BusinessMemberSchema`, `BusinessMemberAliasSchema`, `BusinessMemberDeliveryCardSchema`, `UpdateBusinessMemberAliasResponseSchema`, `TransferBusinessOwnershipResponseSchema`, `businessMemberAliasWarnings`, y los DTOs `BusinessMemberDto`, `CreateBusinessMemberDto`, `UpdateBusinessMemberDto`.
- Produce: `staffRepository` con `list(businessId)`, `create(businessId, body)`, `update(businessId, memberId, body)`, `updateAlias(businessId, memberId, alias)`, `rotate(businessId, memberId)`, `disable(businessId, memberId)`, `enable(businessId, memberId)`, `remove(businessId, memberId)`, `transferOwnership(businessId, memberId)`; `useStaffMembers(businessId)` (queryKey `["staff","list",businessId]`) y `useStaffMutations(businessId)`. (`revokeAll` lo agrega Task 12: su contrato y su ruta nacen en Task 11.)

- [ ] **Step 1: El test**

Con un doble de `api`: cada método pega en la ruta y el verbo del Plan 2
(`PATCH .../:memberId/alias`, `POST .../:memberId/rotate`, `DELETE .../:memberId`
con `api.delete<void>`, `POST .../:memberId/disable`, `POST .../:memberId/enable`);
toda respuesta de lista o de miembro pasa por `z.array(BusinessMemberSchema).parse`
y una respuesta con `role: "jefe"` **falla** (frontera validada con zod, no
confianza); el alias se valida con `BusinessMemberAliasSchema` **antes** de salir.

- [ ] **Step 2: Correr el test y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/business/data/staff.test.ts`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: `staff.ts`**

Un módulo por recurso, mismo patrón que `data/repository.ts` pero contra el API. El
aviso de dominio se calcula con `businessMemberAliasWarnings` de commons: una sola
fuente para "este dominio puede recibir correo".

- [ ] **Step 4: Los hooks**

`useStaffMembers(businessId)` con `enabled: Boolean(businessId)`; las mutaciones
invalidan `["staff","list",businessId]`.

- [ ] **Step 5: Correr y verificar**

Run: `cd apps/mobile && bun test --isolate src && bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/business
git commit -m "feat(mobile): repositorio y hooks de los accesos del equipo"
```

---

### Task 7: La pantalla Equipo

**Files:**
- Create: `apps/mobile/app/business/[id]/staff.tsx`
- Create: `apps/mobile/src/features/business/components/staff/StaffMemberCard.tsx`
- Create: `apps/mobile/src/features/business/components/staff/StaffList.tsx`
- Create: `apps/mobile/src/features/business/components/staff/StaffSectionCard.tsx`
- Modify: `apps/mobile/src/features/business/components/management/GestionContent.tsx` (monta la tarjeta de sección), `SettingsSection.tsx` (la fila "Equipo y accesos")
- Modify: `apps/mobile/src/core/i18n/strings.ts` (claves nuevas bajo `business.staff`)
- Test: `apps/mobile/src/features/business/components/staff/StaffList.states.test.tsx`

**Interfaces:**
- Consumes: `useStaffMembers` (Task 6), `meetsMinRole` (Task 5), `stampStaffSession` (Task 2), `ScreenHeader`/`EmptyState`/`ErrorState`/`AppText`/`Button` de `@/src/core/ui`.
- Produce: la ruta `/business/[id]/staff`; `StaffSectionCard({ businessId, role })` con el conteo y el botón de administrar.

- [ ] **Step 1: Las claves de i18n**

Bajo `business.staff`: `title`, `sectionTitle`, `sectionSubtitle` (con `{count}`),
`manage`, `emptyTitle`, `emptyBody`, `addAccess`, `roleOwner`, `roleManager`,
`roleStaff`, `statusActive`, `statusPaused`, `lastLogin`, `neverLoggedIn`,
`locations`, `allLocations`, `sessionPolicy`, `sessionNever`, `sessionHours`.

- [ ] **Step 2: El test de estados**

`StaffList.states.test.tsx`: en carga → esqueletos; error → `ErrorState` con
reintento que re-ejecuta; vacío → `EmptyState` con el botón de alta; dos miembros →
una tarjeta por miembro y el conteo de la sección es `2`.

- [ ] **Step 3: Correr el test y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/business/components/staff`
Expected: FAIL — `Cannot find module`

- [ ] **Step 4: `StaffMemberCard` y `StaffList`**

La tarjeta muestra nombre, alias, rol, sucursales (los nombres si el negocio tiene
una sola; `"N sucursales"` si tiene varias), política de sesión, última entrada y
estado. **No** ofrece acciones todavía: las agregan Tasks 9, 10 y 13 sobre esta
tarjeta, con el menú montado en la pantalla.

- [ ] **Step 5: La pantalla, la entrada en el panel y el sello con negocio**

`app/business/[id]/staff.tsx` con `ScreenHeader`, el botón de alta y el
`StaffList`. En `GestionContent`, la tarjeta "Equipo y accesos" (`minRole:
'manager'`) y en `SettingsSection` la fila equivalente, las dos hacia la ruta
nueva. Y una llamada a `stampStaffSession(businessId)` cuando la pantalla monta con
el negocio resuelto: es el caso que el sello del login **no** puede resolver —una
persona con dos membresías— y sin esto su sesión nunca queda sellada
(`staff.service.ts:236-243`). El test lo afirma y afirma que un fallo no rompe la
pantalla.

- [ ] **Step 6: Correr y verificar**

Run: `cd apps/mobile && bun test --isolate src && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): sección Equipo, lista de accesos y sello con negocio"
```

---

### Task 8: Dar de alta un acceso

**Files:**
- Create: `apps/mobile/app/business/[id]/staff/new.tsx`
- Create: `apps/mobile/src/features/business/components/staff/StaffForm.tsx`
- Create: `apps/mobile/src/features/business/components/staff/DeliveryCardSheet.tsx`
- Test: `apps/mobile/src/features/business/components/staff/StaffForm.test.tsx`, `DeliveryCardSheet.test.tsx`
- Modify: `apps/mobile/src/core/i18n/strings.ts`

**Interfaces:**
- Consumes: `useStaffMutations` (Task 6), `BusinessMemberDeliveryCardDto`, `Checkbox` de `@/components/ui`, `BottomSheetModal` de `@/src/core/ui`, `QRCode` de `react-native-qrcode-svg` (ya es dependencia).
- Produce: `StaffForm({ locations, submitting, error, onSubmit })` con `onSubmit(values: { label: string; role: "manager" | "staff"; business_location_ids: string[]; session_ttl_hours: number; alias?: string })`; `DeliveryCardSheet({ card, onClose })`.

- [ ] **Step 1: El test del formulario**

No deja enviar sin nombre ni sin al menos una sucursal; con rol `staff` la opción
"sin expiración" **no** aparece (el modo persistente es sólo de `owner` y `manager`,
§9.2); las sucursales se marcan con `Checkbox`.

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/business/components/staff/StaffForm.test.tsx`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: `StaffForm`**

Patrón de `CouponForm.tsx`: `useState` por campo, `canSubmit`, `TextField` con
`error`, `Switch` para lo booleano. El alias es editable con el recordatorio de
formato (`{código}@{slug}.role.ec`); vacío significa que lo genera el servidor.

- [ ] **Step 4: El test de la tarjeta de entrega**

Muestra alias, PIN de seis dígitos y el QR del alias; el aviso dice que el PIN no
se recupera, sólo se rota; copiar deja en el portapapeles alias y PIN juntos
(assertion sobre el texto copiado); cerrar la hoja **advierte** que el PIN no se
vuelve a mostrar.

- [ ] **Step 5: `DeliveryCardSheet`**

Se monta en la pantalla de alta (patrón `useReportProblemSheet`), con
`BottomSheetModal`. El QR codifica el alias en claro, como `pickup-qr.tsx` hace con
su payload: cualquier cámara lo lee y el empleado lo teclea.

- [ ] **Step 6: La pantalla de alta**

`new.tsx` resuelve `businessId`, carga las sucursales con `useBusinessLocations`, y
al crear navega al listado con la hoja montada y el `card` en estado. Un `422` del
API (tope de plan, `R0001`) se muestra con la prosa que el API ya traduce.

- [ ] **Step 7: Correr y verificar, y commitear**

Run: `cd apps/mobile && bun test --isolate src && bun run typecheck`
Expected: PASS

```bash
git add apps/mobile
git commit -m "feat(mobile): alta de un acceso con tarjeta de entrega"
```

---

### Task 9: Cambiar rol, alcance y alias

**Files:**
- Create: `apps/mobile/app/business/[id]/staff/[memberId]/edit.tsx`
- Modify: `apps/mobile/src/features/business/components/staff/StaffForm.tsx` (modo edición con `initial`)
- Test: `apps/mobile/src/features/business/components/staff/StaffForm.edit.test.tsx`

**Interfaces:**
- Consumes: `UpdateBusinessMemberSchema`, `UpdateBusinessMemberAliasResponseSchema` (commons), `staffRepository.update` y `.updateAlias` (Task 6).
- Produce: `StaffForm` acepta `initial?: { label; role; business_location_ids; session_ttl_hours; alias }` y en modo edición cambia el label del botón.

- [ ] **Step 1: El test del modo edición**

Con `initial` el formulario llega con los valores puestos; cambiar el alias a un
dominio fuera de `.role.ec` muestra el aviso que devuelve el API
(`alias_warnings`), no uno calculado en el cliente.

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/business/components/staff/StaffForm.edit.test.tsx`
Expected: FAIL — `initial` no existe

- [ ] **Step 3: El modo edición**

Dos llamadas y en este orden: `PATCH /:memberId` con rol, política y sucursales; y
**si el alias cambió**, `PATCH /:memberId/alias`. Si la segunda falla, se muestra
el error y la pantalla queda abierta con el miembro ya actualizado: el alias es un
dato independiente y su fallo no revierte el resto.

- [ ] **Step 4: El caso del rol del dueño**

La fila del dueño no se edita: no se ofrece el formulario para `role === 'owner'`
(`R0002` lo rechazaría). El test lo afirma.

- [ ] **Step 5: La entrada desde la tarjeta**

`StaffMemberCard` gana el botón "Editar", que navega a la ruta, sólo si
`role !== 'owner'`.

- [ ] **Step 6: Correr y verificar, y commitear**

Run: `cd apps/mobile && bun test --isolate src && bun run typecheck`
Expected: PASS

```bash
git add apps/mobile
git commit -m "feat(mobile): editar rol, sucursales y alias de un acceso"
```

---

### Task 10: Rotar el PIN, pausar, reactivar y eliminar

**Files:**
- Create: `apps/mobile/src/features/business/components/staff/StaffActionsSheet.tsx`
- Create: `apps/mobile/src/features/business/components/staff/RotatePinSheet.tsx`
- Create: `apps/mobile/src/features/business/components/staff/DisableAccessDialog.tsx`
- Test: `apps/mobile/src/features/business/components/staff/StaffActionsSheet.test.tsx`

**Interfaces:**
- Consumes: `staffRepository.rotate/disable/enable/remove` (Task 6), `DeliveryCardSheet` (Task 8), `AlertDialog` de `@/components/ui`.
- Produce: `StaffActionsSheet({ member, onClose, onRotated })` con las cuatro acciones, cada una detrás de su confirmación.

- [ ] **Step 1: El test de las cuatro acciones**

Un caso por acción, con el verbo HTTP afirmado: rotar → `POST .../rotate`; pausar →
`POST .../disable`; reactivar → `POST .../enable`; eliminar →
`DELETE .../:memberId`. Además: rotar **no** llama a `disable` (una assertion
explícita de que el botón que rota no corta sesiones); eliminar nombra la
consecuencia real (el alias no se recicla); la fila del dueño no tiene acciones.

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/business/components/staff/StaffActionsSheet.test.tsx`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: La hoja de acciones**

Un `BottomSheetModal` con las acciones y el estado del miembro decidiendo cuáles se
ofrecen (`active` → rotar/editar/pausar/eliminar; `disabled` →
reactivar/eliminar). El copy de rotar dice, con esas palabras, que las sesiones
abiertas siguen vivas.

- [ ] **Step 4: Rotar muestra la tarjeta nueva**

`RotatePinSheet` usa `DeliveryCardSheet` con el `card` de la respuesta: mismo
componente, misma advertencia, y el test lo afirma reusando el caso de Task 8.

- [ ] **Step 5: Pausar y eliminar confirman**

`DisableAccessDialog` con `AlertDialog`: pausar dice que el acceso se corta **ya**
(incluidas las sesiones de tablet); eliminar dice "Dar de baja" y que la persona no
vuelve a entrar hasta que se le dé un acceso nuevo.

- [ ] **Step 6: Correr y verificar, y commitear**

Run: `cd apps/mobile && bun test --isolate src && bun run typecheck`
Expected: PASS

```bash
git add apps/mobile
git commit -m "feat(mobile): rotar PIN, pausar, reactivar y dar de baja un acceso"
```

---

### Task 11: El corte de emergencia, del lado del servidor

**Files:**
- Modify: `packages/commons/src/business/schemas/business-member.schema.ts` (`RevokeBusinessAccessSchema` / `RevokeBusinessAccessResponseSchema`)
- Modify: `packages/commons/src/business/dtos/business-member.dto.ts` (`RevokeBusinessAccessResponseDto`)
- Modify: `apps/api/src/modules/staff/staff.service.ts` (`revokeAll`), `staff.repository.ts` (los alcanzables, en una consulta), `staff.controller.ts` (`@Post('revoke-all')`)
- Test: `packages/commons/src/business/__tests__/business-member.schema.test.ts`, `apps/api/src/modules/staff/staff.service.spec.ts`, `staff.controller.spec.ts`

**Interfaces:**
- Produce: `POST /api/v1/businesses/:businessId/staff/revoke-all` → `200 { disabled: BusinessMemberDto[]; owner_skipped: boolean }`, con **dos puertas**: `requireActor` (owner o gerente, filtrado por alcance) y `user.role === 'admin'` (plataforma, sin alcance — precedente `restoreOwnership`). `RevokeBusinessAccessResponseSchema = z.strictObject({ disabled: z.array(BusinessMemberSchema), owner_skipped: z.boolean() })`; `RevokeBusinessAccessSchema = z.strictObject({}).optional()` (cuerpo vacío, como `RotateBusinessMemberPinSchema`).

- [ ] **Step 1: El test del contrato**

El schema acepta `owner_skipped: true` y `false`, y **rechaza** su ausencia: el
campo existe para que la UI pueda decir que el dueño quedó afuera, y un campo
opcional sería un silencio.

- [ ] **Step 2: El test del servicio**

Cuatro casos: un owner corta los tres accesos activos y recibe tres; un gerente
corta **sólo** los que su alcance contiene —los demás no se tocan y no aparecen en
la respuesta, igual que `list()` no se los muestra— sin que la operación falle; un
admin de plataforma corta los de cualquier negocio; el dueño **nunca** entra en la
lista, `owner_skipped` es `true` y `business_live_owner_count` no cambió. Y el caso
de un negocio inactivo sin dueño vivo: `owner_skipped` es `false`.

- [ ] **Step 3: El test del controlador**

`POST /businesses/:id/staff/revoke-all` con `role: 'staff'` → 403; sin token → 401;
con dueño → 200 con el sobre.

- [ ] **Step 4: Correr y ver que fallan**

Run: `cd packages/commons && bun test` y `cd apps/api && bun test src/modules/staff`
Expected: FAIL — la ruta y el contrato no existen

- [ ] **Step 5: Implementar el corte**

El gerente alcanza de a uno (`reachesMember`), así que el corte es un bucle con el
mismo predicado que ya usa `list()`, y con el mismo coste ya documentado ahí (el
roster está topado por plan: 2 en `free`, 20 en `pro`). Cada desactivación:
`status = 'disabled'` + `ban_duration` del `auth.users`, **exactamente** como
`disable()`: el corte no inventa un camino nuevo de corte de sesiones, reusa el que
ya está probado. La fila del dueño se saltea antes de mirar el alcance.

- [ ] **Step 6: Correr y verificar**

Run: `cd apps/api && bun test src/modules/staff && bun run typecheck && bun run test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/commons apps/api/src/modules/staff
git commit -m "feat(api): corte de emergencia de todos los accesos del negocio"
```

---

### Task 12: El corte de emergencia, del lado del panel

**Files:**
- Create: `apps/mobile/src/features/business/components/staff/RevokeAllCard.tsx`
- Modify: `apps/mobile/src/features/business/data/staff.ts` y `hooks.ts` (agrega `revokeAll`), `apps/mobile/app/business/[id]/staff.tsx` (arriba del todo)
- Test: `apps/mobile/src/features/business/components/staff/RevokeAllCard.test.tsx`

**Interfaces:**
- Consumes: `RevokeBusinessAccessResponseDto` (Task 11), `staffRepository.revokeAll(businessId): Promise<RevokeBusinessAccessResponseDto>`.
- Produce: `RevokeAllCard({ businessId, role })`.

- [ ] **Step 1: El test**

El botón no aparece para `role: 'staff'`; con la confirmación explícita se llama al
API; el éxito dice **cuántos** accesos se cortaron (el conteo de la respuesta) y,
si `owner_skipped`, nombra que el dueño quedó afuera; un 403 muestra la prosa del
API.

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/business/components/staff/RevokeAllCard.test.tsx`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: La tarjeta y la confirmación**

Arriba del listado, en variante destructiva, con `AlertDialog` de confirmación
explícita ("Cortar todos los accesos") y el aviso de que incluye las sesiones
abiertas.

- [ ] **Step 4: Correr y verificar, y commitear**

Run: `cd apps/mobile && bun test --isolate src && bun run typecheck`
Expected: PASS

```bash
git add apps/mobile
git commit -m "feat(mobile): corte de emergencia desde el panel"
```

---

### Task 13: Transferir la propiedad

**Files:**
- Create: `apps/mobile/src/features/business/components/staff/TransferOwnershipSheet.tsx`
- Modify: `apps/mobile/src/features/business/components/staff/StaffActionsSheet.tsx`
- Test: `apps/mobile/src/features/business/components/staff/TransferOwnershipSheet.test.tsx`

**Interfaces:**
- Consumes: `staffRepository.transferOwnership` (Task 6), `TransferBusinessOwnershipResponseDto`.

- [ ] **Step 1: El test**

La acción sólo aparece si el **actor** es `owner` y el miembro **no**; la
confirmación dice que quien recibe pasa a ser el dueño y que el actual queda como
gerente con el mismo alcance; el éxito navega al panel y refresca la lista.

- [ ] **Step 2: Correr y ver que falla**

Run: `cd apps/mobile && bun test --isolate src/features/business/components/staff/TransferOwnershipSheet.test.tsx`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3: La hoja**

Confirmación con el nombre de la persona y el aviso de que **un dueño no se puede
desactivar ni dar de baja** (consecuencia real: el que transfiere no puede borrar su
cuenta mientras el negocio siga activo, y así está registrado en el ADR-0013). El
copy de éxito sale del DTO (`previous_owner`, `new_owner`), no de una suposición.

- [ ] **Step 4: Correr y verificar, y commitear**

Run: `cd apps/mobile && bun test --isolate src && bun run typecheck`
Expected: PASS

```bash
git add apps/mobile
git commit -m "feat(mobile): transferir la propiedad del negocio"
```

---

### Task 14: Admin — la ficha en pestañas y la pestaña Equipo

**Files:**
- Modify: `apps/admin/src/features/businesses/components/business-detail-drawer.tsx` (pestañas con `PageTabs`)
- Create: `apps/admin/src/features/businesses/api/business-staff.api.ts`
- Create: `apps/admin/src/features/businesses/queries/business-staff.keys.ts`, `business-staff.queries.ts`
- Create: `apps/admin/src/features/businesses/components/business-staff-table.tsx`
- Create: `apps/admin/src/features/businesses/components/business-staff-revoke-dialog.tsx`
- Modify: `apps/admin/src/lib/labels.ts` (`businessMemberRoleLabel`, `businessMemberStatusLabel`)
- Test: `apps/admin/src/features/businesses/components/__tests__/business-staff-table.test.tsx`

**Interfaces:**
- Consumes: `GET /businesses/:businessId/staff` (la rama admin ya existe: `staff.service.ts:153`), `POST /businesses/:businessId/staff/revoke-all` (Task 11), `PageTabs`/`TabPanel` de `@/components/page-tabs`, `Table` de `@/components/ui/table`, `businessesKeys`.
- Produce: `businessStaffApi = { list(businessId), revokeAll(businessId) }`; `businessStaffKeys = { all: ["businesses","staff"], list: (id) => [...all, "list", id] }`; `useBusinessStaff(id: string | null)`, `useRevokeBusinessAccess(businessId)`; `BusinessStaffTable({ businessId, businessName })`, `BusinessStaffRevokeDialog`.

- [ ] **Step 1: Las pestañas de la ficha**

`BusinessDetailDrawer` pasa a pestañas con `PageTabs`: `ficha` (los seis bloques
actuales, sin cambios) y `equipo`; la tercera (`plan`) la agrega el Plan 5 en el
mismo lugar. Estado local `useState`, no URL: el drawer no es una ruta. Los paneles
inactivos quedan montados y ocultos (comportamiento de `TabPanel`), así que las
queries de cada pestaña se gatean con `enabled`.

- [ ] **Step 2: La clave y la query**

Las claves cuelgan del negocio para que invalidar el negocio no arrastre la lista.
`useBusinessStaff(id)` con `enabled: Boolean(id)`, `staleTime` corto (el roster
cambia por acciones del dueño, y el admin lo mira para supervisar).

- [ ] **Step 3: El test de la tabla**

Con un doble de `fetch`: tres miembros se pintan con nombre, alias, rol, sucursales
y estado; el rol sale traducido ("Dueño"/"Gerente"/"Empleado"), nunca crudo; la
tabla es de sólo lectura y **no** ofrece crear ni editar; el botón de corte pide
confirmación y emite el `POST .../revoke-all`; un error del API se ve con el
`requestId` (`notifyMutationError`).

- [ ] **Step 4: Correr y ver que falla**

Run: `cd apps/admin && bun test --isolate src/features/businesses/components/__tests__/business-staff-table.test.tsx`
Expected: FAIL — `Cannot find module`

- [ ] **Step 5: La tabla y el diálogo**

Tabla plana, como `BusinessEmailSendsTable` (esqueletos, error, vacío), con el
estado en una etiqueta traducida, y `BusinessStaffRevokeDialog` con `AlertDialog`.

- [ ] **Step 6: Correr y verificar**

Run: `cd apps/admin && bun test --isolate src && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/admin
git commit -m "feat(admin): pestañas en la ficha del negocio y equipo de sólo lectura"
```

---

## Cierre

- [ ] `bun run typecheck && bun run test && bun run build` en la raíz, verdes.
- [ ] `bunx turbo run test --force --continue` (el caché de turbo no incluye las env de las apps).
- [ ] E2E del móvil: `07-business-management` actualizado y verde.
- [ ] Verificado a mano: un `manager` real ve Equipo y no ve configuración; un
      `staff` ve Productos y Pedidos; el corte de emergencia deja al dueño adentro.
- [ ] Registrado como trabajo siguiente: el botón de escanear la tarjeta (§9.1) y la
      superficie móvil del plan (Plan 5).
- [ ] Plan cerrado en este documento (casillas marcadas con su evidencia).
