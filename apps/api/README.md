# Role API

NestJS backend for **Role** — a Too Good To Go–style surplus food marketplace.

The mobile app currently talks to Supabase directly. This API is the BFF that owns business rules (stock, order lifecycle, payments later) while Supabase remains the source of truth for Postgres schema and Auth.

## Stack

- **NestJS 11** (Express)
- **Drizzle ORM** + `postgres` (Supabase pooler, `prepare: false`)
- **Supabase Auth** JWT verification (`jose`)
- **Zod** validation (+ shared types from `@0xc1x/role-commons`)
- **Scalar** OpenAPI UI at `/docs`
- **Helmet** + **Throttler** for production hardening

## Package manager

Use **npm** only (`package-lock.json`). Do not commit a second lockfile.

## Quick start

```bash
# 1) Build shared package (sibling repo)
cd ../role-commons && bun run build   # commons may use bun

# 2) Install API deps
cd ../role-api && npm install

# 3) Configure env
cp .env.example .env
# fill DATABASE_URL, SUPABASE_URL, SUPABASE_JWT_SECRET, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

# 4) Run
npm run start:dev
```

- Health: `GET http://localhost:3000/api/v1/health`
- Docs: `http://localhost:3000/docs`

## Environment

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP port (default `3000`) |
| `NODE_ENV` | `development` / `production` |
| `DATABASE_URL` | Postgres URL (prefer Supabase **Transaction** pooler `:6543`) |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase → Project Settings → API |
| `SUPABASE_ANON_KEY` | Anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (server only; never to mobile) |
| `SUPABASE_STORAGE_BUCKET` | Default storage bucket |
| `SUPABASE_ALLOWED_BUCKETS` | Comma-separated allowlist |
| `SUPABASE_ALLOWED_FOLDERS` | Comma-separated allowlist |
| `CORS_ORIGINS` | Comma-separated origins (`*` only outside production) |
| `DOCS_USER` / `DOCS_PASSWORD` | Basic auth for `/docs` in production |

Schema ownership: **Supabase**. Do not push Drizzle migrations from this repo in v1. Hand-written Drizzle tables mirror `public`. Optional:

```bash
npm run db:pull      # introspect remote (review before overwriting)
npm run db:studio
npm run db:drift     # informational remote vs local schema signal
```

## Auth

Send Supabase access tokens:

```http
Authorization: Bearer <supabase_access_token>
```

- JWT verified with `SUPABASE_JWT_SECRET` (HS256) and/or JWKS (ES256)
- `role` loaded from `public.profiles` (not from client `user_metadata`)
- Public routes use `@Public()`; role-restricted routes use `@Roles(...)`
- Guards live in `SecurityModule` (`src/auth/`); login/register live in `AuthModule` (`src/modules/auth/`)

## API surface (v1)

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| `GET` | `/api/v1/health` | public | Liveness / DB ping |
| `POST` | `/api/v1/auth/register` | public | Creates consumer (`user`) |
| `POST` | `/api/v1/auth/login` | public | |
| `POST` | `/api/v1/auth/refresh` | public | |
| `POST` | `/api/v1/auth/logout` | public | |
| `GET` | `/api/v1/categories` | public | Catalog categories |
| `GET` | `/api/v1/slides` | public | Home carousel |
| `GET` | `/api/v1/offers` | public | Filters: category, geo, pagination |
| `GET` | `/api/v1/offers/:id` | public | Detail + business/location |
| `POST/PATCH/DELETE` | `/api/v1/offers…` | business / admin | Owner-scoped CRUD |
| `POST` | `/api/v1/orders` | user | `{ offer_id }` — stock transaction |
| `GET` | `/api/v1/orders` | user | My orders |
| `GET` | `/api/v1/orders/business` | business / admin | Orders for owned business |
| `GET` | `/api/v1/orders/:id` | owner / business / admin | |
| `PATCH` | `/api/v1/orders/:id/status` | role + ownership | State machine |
| `GET/POST/PATCH` | `/api/v1/businesses…` | business / admin | Businesses + locations |
| `POST` | `/api/v1/upload` | auth | Image upload (allowlisted bucket/folder) |

Admin-only mutations (categories, slides, invite business) use `@Roles('admin')`.

### Order status machine

```
pending → confirmed | cancelled | expired
confirmed → ready_for_pickup | cancelled
ready_for_pickup → picked_up | cancelled | expired
picked_up → completed
```

Each transition writes `order_events`. Cancel/expire restores stock. A cron job expires stale pickup windows.

## Project layout

```
src/
  auth/              # SecurityModule: JWT + roles guards
  common/            # filters, pipes, decorators, utils
  config/            # Zod env validation
  database/          # Drizzle module + schema mirror
  modules/
    auth/            # login / register / refresh
    businesses/
    categories/
    health/
    offers/
    orders/          # + status machine + expiration job
    slides/
    upload/
  main.ts
  app.module.ts
docs/
  ARCHITECTURE.md    # layers, soft-delete, pagination
openapi/
  openapi.json       # generated via npm run openapi:export
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for mappers, soft-delete (`is_active` vs `deleted_at`), and pagination conventions.

## Shared package

```json
"@0xc1x/role-commons": "file:../role-commons"
```

Rebuild commons after type changes:

```bash
cd ../role-commons && bun run build
# if npm link cache is stale: cd ../role-api && npm install
```

For production deploys, prefer a published semver (GitHub Packages / private npm) over `file:`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run start:dev` | Watch mode |
| `npm run build` | Compile |
| `npm test` | Unit tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` (full strict) |
| `npm run commons:check` | Align `@0xc1x/role-commons` (resolve, dist, zod major) |
| `npm run openapi:export` | Write `openapi/openapi.json` |
| `npm run db:drift` | Informational schema drift check |

## Security notes

- Never expose the Supabase **service_role** key to the mobile app.
- The API uses a privileged DB connection; **authorization is enforced in Nest** (owner / business owner / admin checks).
- Do not trust `user_metadata` for roles.
- Public register always creates `role: 'user'`; business onboarding is admin invite.

## Roadmap (next waves)

- CI/CD + coverage thresholds (Phase 3)
- Docker, readiness probes, structured logging (Phase 4)
- Favorites, reviews, payments / coupons / payouts (Phase 5)
- Point mobile clients at this API
