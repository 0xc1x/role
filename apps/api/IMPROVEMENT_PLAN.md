# Plan de mejora — Role API

Documento de mejora continua para llevar **role-api** a un estándar profesional de BFF/API de producción (NestJS + Drizzle + Supabase).

**Fecha:** 2026-07-30  
**Alcance:** revisión completa del código en `src/`, tests, config, tooling y readiness de producción.  
**Principio:** mantener lo que ya está bien (módulos, Zod compartido, guards, máquina de estados de órdenes, stock con `FOR UPDATE`) y cerrar gaps de seguridad, dominio, calidad y operación.

---

## 1. Estado actual (resumen)

### Fortalezas

| Área | Qué está bien |
|------|----------------|
| Arquitectura | Nest modular (`auth`, `offers`, `orders`, `categories`, `slides`, `upload`, `health`) |
| Validación | Zod vía `@0xc1x/role-commons` + `ZodValidationPipe` con `details` |
| Auth | JWT Supabase (HS256 + JWKS ES256), rol desde `profiles` (no `user_metadata`) |
| Dominio órdenes | Máquina de estados + eventos + decremento de stock atómico |
| Config | Env validado con Zod al boot |
| Docs | Scalar/OpenAPI en `/docs` |
| DB | Drizzle mirror de Supabase; schema ownership clara en README |

### Deuda crítica (prioridad alta)

1. **Registro público crea usuarios `admin`** (`POST /auth/register`).
2. **Autorización de negocio incompleta** (rol `business` sin ownership real en transiciones).
3. **Race en cambio de status** de órdenes (lectura fuera de transacción, sin lock optimista).
4. **Sin rate limit / helmet / hardening de producción**.
5. **Filtro de errores filtra `Error.message` internos al cliente**.
6. **Cancelación de orden no restaura stock**.
7. **Sin CI, Docker, observabilidad ni TypeScript strict completo**.
8. **Cobertura de tests desigual** (orders/auth sin specs de servicio; e2e mínimo).

---

## 2. Roadmap por fases

```
Fase 0  Seguridad y correcciones bloqueantes     (1–3 días)
Fase 1  Dominio y reglas de negocio              (1–2 semanas)
Fase 2  Calidad de código y arquitectura         (1–2 semanas)
Fase 3  Testing y CI/CD                          (1 semana)
Fase 4  Producción, ops y performance            (1–2 semanas)
Fase 5  Producto / features de marketplace       (continuo)
```

Cada fase es independiente y se puede mergear en PRs pequeños.

---

## 3. Fase 0 — Seguridad y correcciones bloqueantes

### 0.1 Registro y roles

**Problema:** `AuthService.register` crea el perfil con `role: 'admin'` y el endpoint es `@Public()`. Cualquiera puede registrarse como admin.

**Acciones:**

- [ ] Cambiar registro público a `role: 'user'` (o deshabilitar registro público).
- [ ] Crear flujo separado `POST /auth/admin/invite` o bootstrap solo con service role + secret de deploy.
- [ ] Nunca aceptar `role` desde el body del cliente.
- [ ] Documentar el flujo de onboarding business (invite / admin aprueba).

### 0.2 Hardening HTTP

- [ ] Añadir `@nestjs/throttler` (login, register, refresh, create order, upload).
- [ ] Añadir `helmet` (headers de seguridad).
- [ ] En producción: `CORS_ORIGINS` obligatorio (lista explícita; nunca `*`).
- [ ] Proteger o deshabilitar `/docs` en `NODE_ENV=production` (basic auth o solo VPN).
- [ ] Validar `iss` y `aud` en `jwtVerify` (URL de Supabase + claim esperado).
- [ ] Límite de body JSON global (`app.use(json({ limit: '1mb' }))`).

### 0.3 Errores y superficie de ataque

- [ ] En `AllExceptionsFilter`: en producción no devolver `exception.message` de errores no-HTTP; solo log interno + `Internal server error`.
- [ ] Añadir `requestId` (UUID o `x-request-id`) en response y logs.
- [ ] Unificar idioma de mensajes de error (hoy mezcla ES/EN).

### 0.4 AuthGuard

- [ ] Opcional: `@OptionalAuth()` para rutas públicas que enriquezcan respuesta si hay token.
- [ ] Cache corto de perfil por `sub` (TTL 30–60s) o claim custom en JWT para no pegar a DB en cada request.
- [ ] Rechazar tokens sin `sub` tipado (ya existe) y sin `exp`.

### 0.5 Upload

- [ ] Validar magic bytes (no solo mimetype) con `file-type` / sharp failure.
- [ ] Limitar dimensiones/peso post-compresión.
- [ ] No confiar en `body.bucket`/`folder` más allá del allowlist (ya hay allowlist — mantener y testear).
- [ ] Eliminar bypass de `FileTypeValidator` en test vía flag de env más explícita o mock.

---

## 4. Fase 1 — Dominio y reglas de negocio

### 4.1 Órdenes (core del marketplace)

| Gap | Acción |
|-----|--------|
| Cancelación no devuelve stock | En transición a `cancelled` / `expired`, `incrementStock` en la misma transacción |
| Race en `updateStatus` | `SELECT … FOR UPDATE` del order dentro de la tx; revalidar `current` status |
| Actor `business` sin ownership | Exigir `isBusinessOwner` real; no basta `actorRole === 'business'` |
| Sin job de expiración | Worker/cron: ofertas con `pickup_end < now` y órdenes `pending`/`ready_for_pickup` → `expired` |
| Sin idempotencia en create | Header `Idempotency-Key` o unique constraint (user + offer + ventana) |
| `pickup_code` expuesto | No devolver `pickup_code` al business hasta `ready_for_pickup` (o solo al owner en pickup) |
| Un usuario, N órdenes de misma oferta | Política de negocio: max 1 orden activa por offer/user |

**Estado máquina — mejoras:**

- [ ] Tests de matriz completa (todos los `from × to × role × ownership`).
- [ ] Evento de sistema `source: 'cron' | 'api' | 'admin'`.
- [ ] Al cancelar/expirar: restaurar stock solo si la orden había consumido stock (flag o siempre 1).

### 4.2 Offers

- [ ] Autorización: `business` owner puede CRUD solo de sus offers; `admin` global.
- [ ] Validar `business_location_id` pertenece a `business_id`.
- [ ] Validar `category_ids` existen y están activos.
- [ ] Validar `discounted_price <= original_price` y `pickup_end > pickup_start` (si no está en commons).
- [ ] Fix conteo total en `findMany`: el `LEFT JOIN` a categorías puede inflar `count()`; usar subquery o `count(DISTINCT offers.id)`.
- [ ] Índices documentados (o migración en Supabase): `(is_active, pickup_end)`, `(business_id)`, geo (idealmente PostGIS).

### 4.3 Módulo Businesses (faltante)

Hoy el schema existe (`businesses`, `business_locations`) pero no hay módulo HTTP.

- [ ] `GET/POST/PATCH` businesses (admin + owner).
- [ ] CRUD locations por business.
- [ ] Endpoint “mis negocios” para rol `business`.
- [ ] Listado de órdenes del business (hoy solo `listMine` del consumer).

### 4.4 Auth de producto

- [ ] Register consumer (`user`) vs invite business.
- [ ] `POST /auth/logout` (revoke refresh si Supabase lo soporta en el flujo).
- [ ] No devolver perfil “fake” con `role: 'user'` si no hay fila en `profiles` — fallar o crear perfil en signup trigger.

---

## 5. Fase 2 — Calidad de código y arquitectura

### 5.1 Estructura recomendada (evolutiva)

```
src/
  auth/                 # infrastructure: guards, types
  common/
    decorators/
    filters/
    pipes/
    interceptors/       # logging, timeout, transform
    mappers/            # o por módulo
    dto/                # solo si no viven en commons
    utils/
  config/
  database/
    schema/
  modules/
    <feature>/
      <feature>.controller.ts
      <feature>.service.ts
      <feature>.repository.ts
      <feature>.mapper.ts
      <feature>.module.ts
      __tests__/ o *.spec.ts
  jobs/                 # crons / workers (expire orders)
  main.ts
  app.module.ts
```

### 5.2 Consistencia de capas

- [x] **Mappers obligatorios** por módulo (como `slides.mapper.ts`); sacar `toResponse` de services.
- [x] Repositorios no exponen `dbClient` crudo al service si se puede evitar; preferir `transaction(fn)` como en offers.
- [x] Un solo estilo de soft-delete (`is_active` / `deleted_at`) documentado.
- [x] Renombrar `SlidesModules` → `SlidesModule`.
- [x] Clarificar nombres: `AuthModule` (guards) vs `AuthFeatureModule` (login) — p.ej. `SecurityModule` + `AuthModule`.
- [x] Respuestas paginadas tipadas en commons (`PaginatedData<T>` + `paginatedDataFromQuery`).

### 5.3 TypeScript estricto

En `tsconfig.json` — **completo**:

- [x] `strict: true`, `noImplicitAny`, `strictNullChecks`, `strictBindCallApply`, `noFallthroughCasesInSwitch`
- [x] `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`

### 5.4 Shared package (`role-commons`)

- [ ] Publicar versión semver (GitHub Packages / npm privado) en lugar de solo `file:../role-commons` para deploys *(ops)*.
- [x] Check local/CI de alineación: `npm run commons:check` (resolve + dist + zod major).
- [ ] Cablear `commons:check` en pipeline CI (Fase 3).
- [ ] Generar OpenAPI schemas desde Zod (o viceversa) para no duplicar docs *(mejora continua)*.
- [x] Documentado en README + `docs/ARCHITECTURE.md` (link local + rebuild + semver en prod).
- [x] Jest resuelve ESM de commons vía `moduleNameMapper` → source TS + `transformIgnorePatterns`.

### 5.5 Drizzle / schema

- [x] Drizzle 1.x: client `postgres-js` sin legacy `schema` map (RQB usa `defineRelations` cuando se necesite).
- [x] Script de drift check: `npm run db:drift` (informational vs remote pull).
- [x] Documentar índices y RLS de Supabase: la API usa conexión privilegiada; la app móvil no debe bypassear reglas vía PostgREST sin política. (ver README + docs/ARCHITECTURE.md)

### 5.6 Estilo y DX

- [x] Un solo package manager — **npm** (`package-lock.json`; `bun.lock` eliminado + ignorado en `.gitignore`).
- [x] Actualizar README con módulos reales (auth, categories, slides, upload, businesses).
- [x] `openapi/` usado para export del spec (`openapi/README.md` + `npm run openapi:export`).
- [x] `npm run openapi:export` que escriba `openapi/openapi.json`.
- [x] `npm run typecheck` + `npm test` + `npm run build` verdes tras Fase 2.

**Fase 2 — estado:** cerrada en código. Pendientes operativos residuales (publicar commons, OpenAPI↔Zod 1:1) van con deploy / Fase 3–5.

---

## 6. Fase 3 — Testing y CI/CD

### 6.1 Matriz de tests objetivo

| Capa | Qué cubrir | Estado hoy |
|------|------------|------------|
| Unit — domain | `order-status.machine` | OK |
| Unit — services | offers, categories, slides, upload | Parcial |
| Unit — services | **orders, auth** | Falta |
| Unit — guards | AuthGuard, RolesGuard | Falta |
| Integration | repositories con testcontainers/Postgres | Falta |
| E2E | health, auth flow, create order + stock, roles | Mínimo (solo health) |

### 6.2 Acciones

- [ ] Specs de `OrdersService`: create (stock 0, inactive, pickup ended), cancel restaura stock, forbidden transitions.
- [ ] Specs de `AuthService`: register no crea admin; login errors mapeados.
- [ ] Specs de guards con tokens mock / jose.
- [ ] E2E con DB de test (Docker Compose) en CI.
- [ ] Coverage threshold en Jest (`branches/lines >= 70%` inicial, subir a 80%).
- [ ] GitHub Actions:
  - `lint` + `typecheck` + `test` en PR
  - `build`
  - opcional: e2e con service containers

### 6.3 Ejemplo de pipeline mínimo

```yaml
# .github/workflows/ci.yml (objetivo)
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --coverage
      - run: npm run build
```

---

## 7. Fase 4 — Producción, ops y performance

### 7.1 Contenedor y deploy

- [ ] `Dockerfile` multi-stage (build + `node dist/main`, non-root user).
- [ ] `docker-compose.yml` local (API + opcional Postgres si no se usa solo Supabase).
- [ ] Health:
  - `GET /health` liveness (proceso vivo)
  - `GET /health/ready` readiness (DB up) — **no** devolver 200 OK si DB down (hoy `degraded` con 200).
- [ ] Graceful shutdown: `enableShutdownHooks()`, timeout de requests in-flight.
- [ ] `NODE_ENV=production` logger levels (`error`, `warn`, `log` — sin debug).

### 7.2 Observabilidad

- [ ] Logger estructurado (Pino / nestjs-pino) con `requestId`, `userId`, `route`.
- [ ] Métricas Prometheus o OpenTelemetry (latencia p95, errores 5xx, stock conflicts).
- [ ] Integración de errores (Sentry u homólogo) con scrub de PII.
- [ ] No loguear tokens ni passwords.

### 7.3 Performance

- [ ] Geo: migrar a **PostGIS** (`ST_DWithin`) + índice GiST; el haversine actual no escala.
- [ ] Paginación: cap duro `limit <= 100` (validar en commons).
- [ ] Cache de listados públicos (offers/categories/slides) con short TTL (Redis o HTTP `Cache-Control`).
- [ ] Connection pool: revisar `max: 10` según plan Supabase pooler.
- [ ] Evitar N+1 y `groupBy` pesado en offers: considerar JSON aggregation o 2 queries (list + categories batch).

### 7.4 Seguridad de datos

- [ ] Revisar que la API no exponga `service_role` en responses/logs.
- [ ] Rotación de secretos documentada.
- [ ] Principle of least privilege: si es posible, rol DB de la API con grants limitados (no superuser).
- [ ] Auditoría: quién cambió status / quién subió imagen (`changed_by` ya en order_events).

---

## 8. Fase 5 — Producto (roadmap alineado al marketplace)

Prioridad sugerida para el producto Too Good To Go–like:

1. **Portal business:** offers + orders del negocio + locations  
2. **Expiración automática** de offers/orders  
3. **Notificaciones** (push / email) en status change  
4. **Favoritos / reviews**  
5. **Pagos y cupones** (`coupon_code` ya reservado)  
6. **Payouts** al negocio  
7. **Apuntar la app móvil a este BFF** (dejar de hablar a Supabase para reglas de negocio)

Cada feature debe nacer con: schema Supabase → mirror Drizzle → DTO en commons → module Nest → tests → OpenAPI.

---

## 9. Checklist de “API profesional” (definition of done)

La API se considera en buen estado profesional cuando:

- [ ] No hay endpoints públicos que elevan privilegios
- [ ] Autorización por rol **y** ownership en todos los mutators
- [ ] Transacciones correctas en stock y status (sin races)
- [ ] Errores seguros en prod + request id
- [ ] Rate limit en auth y mutaciones costosas
- [x] TypeScript `strict` completo (incl. unused + unchecked index)
- [ ] CI verde: lint, typecheck, unit, build
- [ ] E2E del happy path de orden con DB real de test
- [ ] Docker image reproducible
- [ ] Health/ready correctos para orquestadores
- [ ] Logs estructurados sin secretos
- [ ] README y OpenAPI al día con la superficie real
- [ ] Un solo lockfile / package manager
- [ ] `role-commons` versionado para deploy

---

## 10. Quick wins (hacer esta semana)

Ordenados por impacto / esfuerzo:

| # | Cambio | Impacto | Esfuerzo |
|---|--------|---------|----------|
| 1 | Register → `role: 'user'` (o deshabilitar) | Crítico | XS |
| 2 | No filtrar stack/mensajes internos en prod | Alto | XS |
| 3 | `canActorTransition`: exigir `isBusinessOwner` | Alto | S |
| 4 | Restaurar stock al cancelar/expirar | Alto | S |
| 5 | `FOR UPDATE` en updateStatus | Alto | S |
| 6 | Fix `count` offers con DISTINCT | Medio | S |
| 7 | Throttler + helmet | Alto | S |
| 8 | CORS estricto en production | Alto | XS |
| 9 | Specs OrdersService + AuthService | Alto | M |
| 10 | CI GitHub Actions básico | Alto | S |
| 11 | README actualizado | Medio | XS |
| 12 | Unificar lockfile | Bajo | XS |
| 13 | Renombrar `SlidesModules` | Bajo | XS |
| 14 | Health ready ≠ 200 si DB down | Medio | XS |
| 15 | Validar `iss`/`aud` JWT | Medio | S |

---

## 11. Deuda técnica concreta (archivo → hallazgo)

| Ubicación | Hallazgo |
|-----------|----------|
| `src/modules/auth/auth.service.ts` | `register` inserta `role: 'admin'` |
| `src/modules/auth/auth.controller.ts` | Register público sin invite/secret |
| `src/modules/orders/order-status.machine.ts` | `actorRole === 'business'` sin ownership |
| `src/modules/orders/orders.service.ts` | Status update sin lock; cancel sin restock |
| `src/modules/offers/offers.repository.ts` | `count()` puede inflarse con joins; geo sin índice |
| `src/common/filters/http-exception.filter.ts` | Expone `Error.message` genéricos |
| `src/main.ts` | Sin helmet, throttling, shutdown hooks, limit body |
| `src/config/env.schema.ts` | `CORS_ORIGINS=*` por defecto |
| `src/modules/health/health.controller.ts` | Degraded sigue siendo HTTP 200 |
| `src/app.module.ts` | Typo `SlidesModules` |
| `tsconfig.json` | Strict incompleto |
| `test/app.e2e-spec.ts` | Solo health; no flujo de negocio |
| Root | Sin `.github/`, sin `Dockerfile`, dual lockfiles |
| `README.md` | No documenta auth/categories/slides/upload |

---

## 12. Principios a mantener (no romper)

1. **Supabase es source of truth** del schema y Auth; la API es BFF de reglas de negocio.  
2. **Roles solo desde `profiles`**, nunca desde el cliente.  
3. **Stock y órdenes en transacciones** con locks.  
4. **Contratos compartidos en `role-commons`** (una sola fuente de DTOs).  
5. **Prefijo versionado** `/api/v1` — breaking changes → `/api/v2`.  
6. **Guards globales** + `@Public()` / `@Roles()` explícitos.  
7. **No exponer `service_role`** al mobile.

---

## 13. Cómo usar este plan

1. Abrir issues o tickets por ítem de las fases 0–1 primero.  
2. Un PR = un tema (ej. “fix: register no longer creates admin”).  
3. Marcar checkboxes en este archivo al completar (o mover a un project board).  
4. Re-revisar el plan cada 2 sprints; el marketplace evolucionará.

---

## 14. Referencias internas

- Auth: `src/auth/`, `src/modules/auth/`  
- Órdenes: `src/modules/orders/`  
- Ofertas: `src/modules/offers/`  
- Env: `src/config/env.schema.ts`  
- Commons: `../role-commons` (`@0xc1x/role-commons`)  
- Docs runtime: `http://localhost:3000/docs`
)
