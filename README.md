# Rolé — monorepo

Ecosistema TS unificado: app móvil (Expo), landing (TanStack Start), admin (TanStack Start) y API (NestJS), con contratos compartidos en `packages/commons`.

## Mapa

```
role/
├── apps/
│   ├── api/          # NestJS 11 + drizzle-orm + supabase-js   [heredado de github.com/0xc1x/role-api]
│   ├── admin/        # TanStack Start + shadcn + biome         [heredado de github.com/0xc1x/role-front-admin]
│   ├── landing/      # TanStack Start — marketing/SEO + onboarding business   [PENDIENTE scaffold]
│   └── mobile/       # Expo — port del app Flutter (fudi)      [PENDIENTE scaffold]
└── packages/
    └── commons/       # DTOs, schemas Zod, enums, tipos (pkg @0xc1x/role-commons)  [heredado de ~/Projects/role-commons]
```

**Flutter (fudi) queda fuera del monorepo** como repo separado, congelado a features, hasta que `mobile` alcance paridad (estrategia strangler).

## Decisiones (ADRs)

Decisiones de arquitectura documentadas en `docs/decisions/` (formato ADR ligero):

| ADR | Decisión |
|---|---|
| ADR-0001 | Package manager: bun (un solo lockfile) |
| ADR-0002 | Móvil se comunica directo con Supabase (API = BFF de admin/landing) |
| ADR-0003 | Bundle ID `com.xcix.role` — renombrar a la empresa pre-release |
| ADR-0004 | Landing = marketing/SEO + onboarding con verificación manual |
| ADR-0005 | Monorepo — unificación de api/admin/commons; fudi fuera hasta sunset |

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

## Estado (verificado)

- ✅ `bun install` — un solo `bun.lock` en la raíz; commons resuelve por `workspace:*` (ya NO se requiere token de GitHub Packages — el repo standalone falla con 401, el monorepo no).
- ✅ `role-commons` build (tsc + fix-imports).
- ✅ `api` typecheck + build (nest).
- ✅ `admin` **build** (nitro) — requiere el hoist del alias `nitro→nitro-nightly` en la raíz (ver abajo).
- ⚠️ `admin` **typecheck** — 3 errores pre-existentes del repo (no causados por el wiring), surfaced por el lockfile fresco: `color-picker.tsx` (tipo union de base-ui), `slide.form.tsx` (drift de contrato móvil: commons HEAD hizo `badge_text` nullable — commit `d561ee8` — y el form aún espera `string`), `vite.config.ts` (`rollupConfig` eliminado de API de nitro-nightly). Pendiente de fix en `apps/admin`.
- ⏳ `landing`, `mobile`: solo estructura; scaffold pendiente (ver `apps/landing/README.md` y `apps/mobile/README.md`).

### Workaround: alias nitro en la raíz

`apps/admin` usa `"nitro": "npm:nitro-nightly@latest"` (alias por documentación de TanStack Start). En layout de workspace el self-import interno de nitro-nightly no se resuelve (store de bun) → el alias vive también como dependency en `package.json` raíz (hoist). Si se corrige aguas arriba (nitro publicando `nitro` estable), se elimina el hoist.
