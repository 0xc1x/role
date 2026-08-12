# Rolé — Arquitectura del ecosistema

Brief compartido del monorepo: principios, topología, flujos de datos y límites. Complementa a `AGENTS.md` (raíz).

## Principios

1. **Contracts-first**: `packages/commons` define DTOs, schemas Zod, enums y entidades por dominio. Los consumidores derivan tipos desde los schemas (nada de interfaces duplicadas).
2. **Supabase directo desde clientes**: el móvil y la API consumen Supabase directamente; la fuente de verdad de schema Postgres y Auth vive en Supabase (RLS como frontera de datos).
3. **API como BFF**: la API de NestJS posee las reglas de negocio que no deben vivir en el cliente (stock, ciclo de órdenes, pagos futuros) y sirve a admin/landing. No es intermediaria del móvil.
4. **Un solo package manager (bun)** y un solo lockfile; `workspace:*` para paquetes internos (sin publicación al registry).
5. **Compilador como guard de contratos**: un cambio en `commons` rompe donde toca; `bun run typecheck` en la raíz es el drift-check.

## Topología

```
apps/mobile ──┐                ┌── apps/admin
              ├─ Supabase ─────┤
apps/api ─────┘                └── apps/landing
   ▲                                ▲
   └────────── HTTP ────────────────┘
         (admin y landing llaman a la API)
   packages/commons ←── workspace:* ── api, admin, landing, mobile
```

## Flujos de datos

**Registro de negocio (landing)**: el negocio se registra desde la landing (TanStack Start) → insert directo a Supabase con `is_active=false` → el admin verifica los datos personalmente (admin → API → actualiza estado) → el móvil muestra el negocio cuando RLS lo permite.

**Catálogo y órdenes (móvil)**: el móvil lee/crea ofertas, órdenes y reservas directo contra Supabase (mismas queries y RLS que el app Flutter fudi). La API posee las reglas transaccionales (stock, ciclo de vida de órdenes) para admin/landing.

**Panel admin**: consume la API REST (`VITE_API_URL`) y los contratos de `commons` para tipar respuestas.

## Stack por app

| App | Stack | Verificación |
|---|---|---|
| `apps/api` | NestJS 11, Drizzle ORM, jose (JWT), zod, swagger+scalar | `bun run typecheck` + `bun run test` (jest) |
| `apps/admin` | TanStack Start/Router/Query/Form/Table, Tailwind 4 + shadcn/Base UI, Biome | `bun run typecheck` + `bun run check` + `bun run test` (vitest) |
| `apps/landing` | TanStack Start (SSR — SEO critical), shadcn | igual que admin (scaffold pendiente) |
| `apps/mobile` | Expo, expo-router, TanStack Query + Zustand, zod | typecheck + test (scaffold pendiente) |
| `packages/commons` | zod 4, TS estricto, ESM | `bun run build` (tsc + fix-imports) |

## Límites y fronteras

- **Seguridad**: RLS en Supabase es la frontera de datos; la API valida input con zod y verifica JWT (jose); guards por rol; Helmet + Throttler en producción.
- **Contratos**: no inventar campos de dominio fuera de `commons` — si el admin necesita un campo nuevo, el contrato se actualiza en `commons` (ver `docs/contracts.md`).
- **Build order**: `turbo` ejecuta `commons` antes que sus consumidores; nunca dependas de un paquete sin declararlo en `dependencies`.
- **Flutter (fudi)**: repo aparte, en sunset hasta paridad de `mobile`.
