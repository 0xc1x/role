# Rolé API (`apps/api`)

NestJS BFF para **admin** y **landing**. Posee reglas de negocio (stock, ciclo de órdenes, pagos futuros). El móvil consume Supabase directo (ADR-0002).

## Stack

- **NestJS 11** (Express, SWC)
- **Drizzle ORM** + `postgres` (Supabase pooler, `prepare: false`)
- **Supabase Auth** JWT (`jose`)
- **Zod** + tipos de `@0xc1x/role-commons` (`workspace:*`)
- **Scalar** OpenAPI en `/docs`
- **Helmet** + **Throttler**

## Quick start (monorepo)

Desde la raíz del repo:

```bash
bun install
cp apps/api/.env.example apps/api/.env
# Completar DATABASE_URL, SUPABASE_* en apps/api/.env

bun run dev:api
```

O desde este directorio:

```bash
bun run start:dev
```

- Health: `GET http://localhost:3000/api/v1/health`
- Docs: `http://localhost:3000/docs`

## Contratos compartidos

`@0xc1x/role-commons` vive en `packages/commons` y se resuelve por `workspace:*`.
Turbo compila commons antes de typecheck/build de la API.

```bash
# Desde la raíz
bun run typecheck --filter=role-api...
bun run test --filter=role-api
```

Tras cambiar schemas en commons: `bun run build --filter=@0xc1x/role-commons`.

## Environment

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default `3000`) |
| `NODE_ENV` | `development` / `production` |
| `DATABASE_URL` | Postgres (prefer Supabase Transaction pooler `:6543`) |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_JWT_SECRET` | JWT secret (Project Settings → API) |
| `SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (server only) |
| `SUPABASE_STORAGE_BUCKET` | Default storage bucket |
| `SUPABASE_ALLOWED_BUCKETS` | Comma-separated allowlist |
| `SUPABASE_ALLOWED_FOLDERS` | Comma-separated allowlist |
| `CORS_ORIGINS` | Comma-separated origins (`*` only outside production) |
| `DOCS_USER` / `DOCS_PASSWORD` | Basic auth for `/docs` in production |

Schema ownership: **Supabase**. Drizzle en este repo es espejo de `public` — no push de migraciones en v1.

```bash
bun run db:pull      # introspect remote (revisar antes de sobrescribir)
bun run db:studio
bun run db:drift     # señal informativa schema local vs remoto
```

## Auth

```http
Authorization: Bearer <supabase_access_token>
```

- JWT verificado con `SUPABASE_JWT_SECRET` (HS256) y/o JWKS (ES256)
- `role` desde `public.profiles` (no `user_metadata`)
- `@Public()` / `@Roles(...)` en rutas

## Scripts

| Script | Purpose |
|--------|---------|
| `bun run start:dev` | Watch mode (SWC) |
| `bun run build` | Compile |
| `bun run test` | Unit tests (Jest) |
| `bun run test:cov` | Unit + coverage |
| `bun run test:e2e` | E2E (requiere env completo) |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run openapi:export` | Escribe `openapi/openapi.json` |
| `bun run db:drift` | Drift check informativo |

## Documentación

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — capas, soft-delete, paginación
- [docs/TESTING.md](docs/TESTING.md) — Jest, cobertura, CI
- [AGENTS.md](AGENTS.md) — guía de agente
- [../../docs/roadmap-api-mirror.md](../../docs/roadmap-api-mirror.md) — migración lógica Supabase → API

## Seguridad

- Nunca exponer `service_role` al móvil.
- Autorización en Nest (owner / business / admin), además de RLS en clientes.
- Registro público crea `role: 'user'`; onboarding business vía admin.
