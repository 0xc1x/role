# Rolé — monorepo

Ecosistema TS unificado: app móvil (Expo), landing (TanStack Start), admin (TanStack Start) y API (NestJS), con contratos compartidos en `packages/commons`.

## Mapa

```
role/
├── apps/
│   ├── api/          # NestJS 11 + drizzle-orm + supabase-js
│   ├── admin/        # TanStack Start + shadcn + biome
│   ├── landing/      # TanStack Start — marketing/SEO + onboarding business
│   └── mobile/       # Expo — app móvil consumer
└── packages/
    └── commons/      # DTOs, schemas Zod, enums, tipos (@0xc1x/role-commons)
```

La app móvil consumer vive como `apps/mobile` (Expo) dentro del monorepo.

## Decisiones (ADRs)

Decisiones de arquitectura documentadas en `docs/decisions/` (formato ADR ligero):

| ADR | Decisión |
| --- | --- |
| ADR-0001 | Package manager: bun (un solo lockfile) |
| ADR-0002 | Móvil se comunica directo con Supabase (API = BFF de admin/landing) |
| ADR-0003 | Bundle ID `com.xcix.role` — renombrar a la empresa pre-release |
| ADR-0004 | Landing = marketing/SEO + onboarding con verificación manual |
| ADR-0005 | Monorepo — unificación de api/admin/commons/mobile en un solo repo |

**Pendiente**: tri-state de verificación de negocio (`pending/active/rejected`) antes de congelar schemas.

## Para agentes

- `AGENTS.md` (raíz) — hub canónico: reglas, interrelación, rutas de lectura por tarea.
- `docs/architecture.md`, `docs/contracts.md` — briefs compartidos.
- Cada app tiene su guía de agente alineada a su ecosistema (`apps/api/AGENTS.md`, `apps/admin/AGENTS.md`, etc.).

## Comandos

```sh
bun install                 # instala todo el workspace (genera bun.lock en la raíz)
bun run build               # turbo: commons → api → admin (solo lo afectado)
bun run typecheck           # turbo: typecheck de todos (requiere dist/ de commons)
bun run test                # turbo: vitest (admin) + jest (api)
bun run dev:api             # NestJS watch (swc)
bun run dev:admin           # Vite dev :3000
```

Filtros turbo: `bun run build --filter=api...` (solo api y sus dependencias).

CI en `.github/workflows/ci.yml` (typecheck + test + build con turbo).

## Estado (verificado)

- ✅ `bun install` — un solo `bun.lock` en la raíz; commons resuelve por `workspace:*`.
- ✅ `commons` build (tsc + fix-imports).
- ✅ `api` typecheck + build (nest).
- ✅ `admin` **build** (nitro) — requiere el hoist del alias `nitro→nitro-nightly` en la raíz (ver abajo).
- ✅ `admin` **typecheck** + biome check.
- ✅ `mobile` **typecheck** (tsc estricto, EXIT 0) + **tests** (vitest: dominio de ofertas y órdenes) — scaffold completo: auth, ofertas, órdenes, favoritos, perfil, negocio, landing in-app.
- ✅ `landing` **typecheck** (tsc EXIT 0) + **build** (vite + nitro, SSR) + biome check — 8 rutas: `/`, `/about`, `/how-it-works`, `/for-business`, `/help-center`, `/privacy`, `/terms`, 404. Deep links `role://` a la app.
- ✅ `api` **tests** (jest) — 13 suites / 776 tests verdes; fixes: mapper de commons a `packages/commons`, transform de ESM-only (`jose`) en jest.config, tipos en 3 specs.

### Workaround: alias nitro en la raíz

`apps/admin` usa `"nitro": "npm:nitro-nightly@latest"` (alias por documentación de TanStack Start). En layout de workspace el self-import interno de nitro-nightly no se resuelve (store de bun) → el alias vive también como dependency en `package.json` raíz (hoist). Si se corrige aguas arriba (nitro publicando `nitro` estable), se elimina el hoist.
