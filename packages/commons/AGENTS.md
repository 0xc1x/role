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

## Política de purga (decisión 2026-09-06)

- Los DTOs que espejan tablas de Supabase (`orders`, `order_events`, `device_tokens`, `favorites`, `user_consents`, `user_preferences`, preferencias de notificaciones, `business_hours`, `payment_*`) **se mantienen aunque hoy no tengan consumidor**: la API los usará al activar los flujos pendientes (pagos, push, preferencias). Borrarlos es retrabajo — no repetir la purga de 2026-09 que hubo que revertir.
- Solo se elimina lo transversal muerto sin contraparte de dominio: envelopes genéricos (`ApiResponse`, `PaginatedResponse`, `ApiError`), alias deprecados (`PaginatedMeta`) y constantes duplicadas.

## Decisiones Zod 4.5 (auditadas 2026-09-06)

- **API canónica**: `z.email()`, `z.uuid()`, `z.url()` top-level. Los encadenados `z.string().email()` / `.uuid()` / `.url()` están deprecados — no usarlos en schemas nuevos.
- **`TimestamptzSchema` deliberadamente laxo** (`z.string().min(1)`): PostgREST devuelve offsets `+00:00`; `z.iso.datetime()` solo los acepta con `{ offset: true }` y endurecerlo rompería contratos sin ganancia de negocio. No "endurecer" sin verificar el formato real de Supabase.
- **`.min()`/`.max()` de strings cuentan code points** (fix de 4.5), no unidades UTF-16: queda alineado con `character varying` de Postgres y es más laxo con emojis. No recalibrar límites (`badge_text`, `caption`, etc.).
- **`z.compile` / `z.validate` no aplican hoy dentro de commons**: el paquete no parsea en loops calientes; la API valida vía `ZodValidationPipe`, que necesita el `ZodError` para armar el 400 (`safeParse` es correcto ahí). Reevaluar solo si aparecen validaciones de arrays grandes en hot paths (p. ej. validar respuestas paginadas).

## Verificación

```sh
bun run build     # tsc + fix-imports (dentro del paquete)
bun run typecheck # desde la raíz del monorepo — valida consumidores
```
