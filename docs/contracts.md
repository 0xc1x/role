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
- Validación server-side (api) y client-side (admin) usan los MISMOS schemas — no duplicar validaciones. Mobile no valida payloads de salida (Supabase + RLS es su frontera de datos, ADR-0002): sus formularios validan con reglas locales y los tipos vienen de commons; no arrastrar schemas de query de API a la app móvil sin necesidad real.

## Convenciones verificadas en DB (2026-09)

- **`active` vs `is_active` y `updated_at` nullable varían por tabla** — verificado contra Supabase/drizzle en la auditoría de 2026-09. No "normalizar" nombres en los contratos sin verificar primero el schema drizzle de `apps/api` y la tabla real.
- **DTOs espejo de DB se conservan sin consumidor**: contratos de tablas con flujos aún desactivados (pagos, push, preferencias, consents) permanecen en `commons` — la API los adoptará al activarlos (ver política de purga en el AGENTS.md del paquete).
- **Zod 4.5**: API canónica top-level (`z.email()`, `z.uuid()`, `z.url()`); `TimestamptzSchema` laxo a propósito (offsets `+00:00` de PostgREST); `.min`/`.max` cuentan code points (alineado con Postgres). Detalles en el AGENTS.md del paquete.
