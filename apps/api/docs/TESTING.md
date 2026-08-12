# Testing — Role API

## Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Unit tests (`src/**/*.spec.ts`) |
| `npm run test:cov` | Unit + coverage (thresholds in `jest.config.js`) |
| `npm run test:e2e` | E2E smoke (requires full env; otherwise most suites skip) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## Layout

- **Unit / domain:** co-located `*.spec.ts` next to the unit under test.
- **Guards:** `src/auth/*.guard.spec.ts` — JWT built with `jose` (HS256) + mock DB.
- **E2E:** `test/app.e2e-spec.ts` — boots Nest only when `DATABASE_URL` and `SUPABASE_*` are set.

## Coverage thresholds

Initial floor in `jest.config.js` (raise toward **70%** branches/lines, then **80%**):

```js
coverageThreshold: {
  global: { branches: 50, functions: 50, lines: 50, statements: 50 },
}
```

Excludes: `*.module.ts`, `main.ts`, `database/schema/**`, specs.

## CI

GitHub Actions: `.github/workflows/ci.yml`

- `npm ci` → `lint` → `typecheck` → `test:cov` → `build`
- `role-commons` is expected as sibling `file:../role-commons` (workflow attempts to check out / link it).

## Integration / testcontainers (pending)

Repository-level tests against real Postgres (Testcontainers or Compose) are **not** wired yet. Preferred path:

1. `docker compose` service `postgres:16` for local/CI.
2. Apply Supabase-compatible schema (or dump of public tables used by the API).
3. Jest integration project with longer timeout, `DATABASE_URL=postgresql://…`.

Until then, business rules are covered by unit tests with mocked repositories (orders stock, status machine, auth role on register).

## Auth register invariant

`AuthService.register` must insert `role: 'user'` only. Guarded by unit test asserting `mockDb.values` payload.
