# Architecture notes — Role API

## Layers (per feature module)

```
controller  →  HTTP, guards, Zod pipes, Swagger metadata
service     →  business rules, authorization, orchestration
repository  →  Drizzle queries; exposes `transaction(fn)` (not raw db client)
mapper      →  DB row ↔ API DTO (dates, numerics, visibility rules)
```

Reference: `slides` (`SlideMapper`), `offers` (`OfferMapper`), `orders` (`OrderMapper`),
`categories` (`CategoryMapper`), `businesses` (`BusinessMapper`).

## Module naming

| Module | Path | Responsibility |
|--------|------|----------------|
| `SecurityModule` | `src/auth/` | JWT guards, roles, optional auth (global) |
| `AuthModule` | `src/modules/auth/` | Login, register, refresh, invite |
| Feature modules | `src/modules/<name>/` | Domain HTTP surface |

## Soft-delete conventions

Two patterns exist in Supabase and are mirrored here. Prefer consistency **within** an entity:

| Pattern | Entities | Delete behaviour | List filters |
|---------|----------|------------------|--------------|
| **`deleted_at`** (timestamp) | `categories`, `slides` | Set `deleted_at = now()` | `WHERE deleted_at IS NULL` |
| **`is_active`** (boolean) | `offers`, `businesses`, `business_locations` | Set `is_active = false` | `WHERE is_active = true` (public lists) |

- Do **not** hard-delete marketplace entities from the API in v1.
- Orders are **status-based** (not soft-deleted): terminal states `cancelled` / `expired` / `completed` / `picked_up`.
- Admin list endpoints may include inactive rows when query flags allow (`is_active`, `active`).

## Pagination

Canonical list body from `@0xc1x/role-commons`:

```ts
PaginatedData<T> = { data: T[]; meta: PaginationMeta }
// helpers: paginatedDataFromQuery, buildPaginationMeta
```

`limit` is capped at **100** in shared Zod query schemas.

## Database

- **Source of truth:** Supabase (migrations / dashboard). This repo only **mirrors** tables in Drizzle.
- Connection: privileged pooler URL; authorization is enforced in Nest (roles + ownership).
- Drizzle 1.x uses `postgres-js` via `drizzle({ client })`. Tables are imported from `./schema/*` in repositories.
- Drift signal: `bun run db:drift` (informational vs remote pull).

## Shared package

`@0xc1x/role-commons` lives in `packages/commons` and is consumed via `workspace:*`.
See `docs/contracts.md` for change workflow.

Rebuild after schema changes:

```bash
bun run build --filter=@0xc1x/role-commons
```

**Jest:** commons is ESM-only. Unit tests map `@0xc1x/role-commons` to TypeScript source (`jest.config.js` → `moduleNameMapper` → `../../packages/commons/src/index.ts`).

## Roadmap

Migración de lógica de negocio desde Supabase (RPCs, triggers, edges) hacia esta API: `docs/roadmap-api-mirror.md` (ADR-0008).
