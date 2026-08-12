# Role Commons — Contracts SSOT (Agent Guide)

Guía de agente de `packages/commons`, la **fuente de verdad de contratos** del ecosistema Rolé. La raíz del monorepo (`AGENTS.md`) y `docs/contracts.md` definen las reglas globales.

## Rol

DTOs, schemas **Zod**, enums y entidades por dominio, consumidos por `api`, `admin`, `landing` y `mobile` vía `workspace:*`. **No se publica al registry.**

## Estructura

```
src/
├── <dominio>/{schemas,dtos,enums,entities}/
│   business · catalog (offers/coupons) · order · payment · review · slides · categories · user
└── _common/          # enums y schemas transversales (app-role, platform, day-of-week, api)
```

## Reglas del paquete

- **Zod schemas son la fuente primaria**: los tipos se derivan (`z.infer`) — no escribir interfaces duplicadas.
- **Cambiar un contrato rompe consumidores**: `bun run typecheck` en la raíz valida el blast radius. Los breaking changes se actualizan con TODOS sus consumidores **en el mismo PR**.
- **Nuevo dominio** = carpeta nueva en `src/`. NO crear un paquete workspace separado sin consumidor real.
- **Build**: `bun run build` = `tsc` + `scripts/fix-imports.mjs` → `dist/` (ESM puro). Los consumidores usan `dist/` compilado (Metro/Vite no transpilan TS del paquete); turbo lo regenera antes de typecheck/build.
- **OpenAPI**: `bun run docs:export` → `openapi.json`.

## Verificación

```sh
bun run build     # tsc + fix-imports (dentro del paquete)
bun run typecheck # desde la raíz del monorepo — valida consumidores
```
