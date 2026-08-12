# Rolé — Gestión de contratos (`packages/commons`)

Cómo se modelan, versionan y validan los contratos compartidos del ecosistema.

## Fuente de verdad

`packages/commons` es el único lugar donde se definen DTOs, schemas, enums y entidades. Los consumidores (`api`, `admin`, `landing`, `mobile`) lo importan por `workspace:*` — **no se publica al registry** (el monorepo elimina la necesidad de versiones publicadas y el drift entre ellas).

## Cómo se modelan

- **Schemas Zod** son la fuente primaria: los tipos se derivan (`z.infer<typeof X>`). No escribir interfaces duplicadas a mano.
- Estructura por dominio: `src/<dominio>/{schemas,dtos,enums,entities}/` + `_common/` (enums y schemas transversales: app-role, platform, day-of-week, api pagination).
- Un **nuevo dominio** = carpeta nueva dentro de `src/`. NO crear un paquete workspace separado sin un consumidor real — se divide solo si el grafo de dependencias lo exige.

## Cambiar un contrato

1. El cambio se hace en `commons` + **todos sus consumidores en el mismo PR** (ventaja del monorepo: cambio atómico).
2. `bun run typecheck` en la raíz es el guard: rompe exactamente donde el contrato ya no se cumple. Este reemplaza al `check-commons-align.mjs` heredado (script de la época de repos separados).
3. Cambios **breaking**: actualiza consumidores en el mismo PR; no dejes estados intermedios en `main`.
4. Semántica: preferir schemas con `.optional()`/`.nullable()` explícito en vez de booleanos mágicos (ver ejemplo: `badge_text` nullable del módulo slides rompió el form del admin hasta alinearlo).

## OpenAPI

- Desde `commons`: `bun run docs:export` → `openapi.json` (espec derivada de los schemas).
- Desde la API: `bun run openapi:export` (NestJS + swagger → `apps/api/openapi/`).

## Build del paquete

`bun run build` = `tsc` + `scripts/fix-imports.mjs` → `dist/` (ESM puro). Los consumidores usan el build compilado (Metro/Vite no transpilan TS del paquete). El `dist/` se regenera por turbo antes de typecheck/build de los consumidores (`dependsOn ^build`).

## Reglas para agentes

- La fuente de verdad es `packages/commons/AGENTS.md` (guía del paquete).
- Nunca importes `commons` desde una ruta profunda inexistente: el paquete exporta desde el índice raíz (`exports` en `package.json`).
- Validación client-side (admin/mobile) y server-side (api) usan los MISMOS schemas — no duplicar validaciones.
