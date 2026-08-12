# Rolé — monorepo

Ecosistema TS unificado: app móvil (Expo), landing (TanStack Start), admin (TanStack Start) y API (NestJS), con contratos compartidos en `role-commons`.

## Mapa

```
role/
├── apps/
│   ├── api/          # NestJS 11 + drizzle-orm + supabase-js   [heredado de github.com/0xc1x/role-api]
│   ├── admin/        # TanStack Start + shadcn + biome         [heredado de github.com/0xc1x/role-front-admin]
│   ├── landing/      # TanStack Start — marketing/SEO + onboarding business   [PENDIENTE scaffold]
│   └── mobile/       # Expo — port del app Flutter (fudi)      [PENDIENTE scaffold]
└── packages/
    └── role-commons/ # DTOs, schemas Zod, enums, tipos         [heredado de ~/Projects/role-commons]
```

**Flutter (fudi) queda fuera del monorepo** como repo separado, congelado a features, hasta que `mobile` alcance paridad (estrategia strangler).

## Decisiones de arquitectura (registro)

1. **Package manager: bun** (los repos heredados ya estaban en bun; EAS detecta bun por `bun.lock` — mantener UN solo lockfile en la raíz).
2. **`role-commons` como workspace `workspace:*`** — se deja de publicar al registry (GitHub Packages); el compilador TS reemplaza a `commons:check`.
3. **La app móvil se comunica DIRECTO con Supabase** (mismas queries, mismo RLS). La API sirve a admin/landing.
4. **Landing = marketing + SEO + registro de negocios** con verificación manual (el negocio no se activa hasta revisión personal del admin).
5. **Bundle ID / applicationId: `com.xcix.role`** — renombrar `xcix → empresa` ANTES del primer release a stores (se congela con la primera subida).
6. **Pendiente**: estado de verificación de negocio (hoy `is_active: boolean`; evaluar tri-state `pending/active/rejected` + auditoría antes de congelar schemas).
7. **Web consumer**: la landing cubre marketing/SEO; el app consumer es mobile-first en Expo.

## Comandos

```sh
bun install                 # instala todo el workspace (genera bun.lock en la raíz)
bun run build               # turbo: role-commons → api → admin (solo lo afectado)
bun run typecheck           # turbo: typecheck de todos (requiere dist/ de role-commons)
bun run test                # turbo: vitest (admin) + jest (api)
bun run dev:api             # NestJS watch (swc)
bun run dev:admin           # Vite dev :3000
```

Filtros turbo: `bun run build --filter=api...` (solo api y sus dependencias).

## Estado (verificado)

- ✅ `bun install` — un solo `bun.lock` en la raíz; role-commons resuelve por `workspace:*` (ya NO se requiere token de GitHub Packages — el repo standalone falla con 401, el monorepo no).
- ✅ `role-commons` build (tsc + fix-imports).
- ✅ `api` typecheck + build (nest).
- ✅ `admin` **build** (nitro) — requiere el hoist del alias `nitro→nitro-nightly` en la raíz (ver abajo).
- ⚠️ `admin` **typecheck** — 3 errores pre-existentes del repo (no causados por el wiring), surfaced por el lockfile fresco: `color-picker.tsx` (tipo union de base-ui), `slide.form.tsx` (drift de contrato móvil: role-commons HEAD hizo `badge_text` nullable — commit `d561ee8` — y el form aún espera `string`), `vite.config.ts` (`rollupConfig` eliminado de API de nitro-nightly). Pendiente de fix en `apps/admin`.
- ⏳ `landing`, `mobile`: solo estructura; scaffold pendiente (ver `apps/landing/README.md` y `apps/mobile/README.md`).

### Workaround: alias nitro en la raíz

`apps/admin` usa `"nitro": "npm:nitro-nightly@latest"` (alias por documentación de TanStack Start). En layout de workspace el self-import interno de nitro-nightly no se resuelve (store de bun) → el alias vive también como dependency en `package.json` raíz (hoist). Si se corrige aguas arriba (nitro publicando `nitro` estable), se elimina el hoist.
