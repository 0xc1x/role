# Rolé Admin (`apps/admin`)

Panel de administración — TanStack Start + Query + Form + Table.

## Documentación

- [AGENTS.md](./AGENTS.md) — guía de agente (estructura feature-first, convenciones, comandos)
- [../../docs/contracts.md](../../docs/contracts.md) — contratos compartidos (`packages/commons`)
- [../../docs/architecture.md](../../docs/architecture.md) — topología del ecosistema

## Stack

| Capa | Librería |
|------|----------|
| Framework | TanStack Start (React 19) |
| Routing | TanStack Router (file-based) |
| Server state | TanStack Query |
| Forms | TanStack Form |
| Tables | TanStack Table |
| Styles | Tailwind CSS 4 + shadcn/Base UI |
| HTTP client | `fetch` nativo |
| Tipos compartidos | `@0xc1x/role-commons` (`workspace:*`) |
| Lint / Format | Biome |
| Tests | Vitest + Playwright |

## Requisitos

- [Bun](https://bun.sh) >= 1.2 (package manager del monorepo)
- API corriendo (`bun run dev:api` desde la raíz)

## Variables de entorno

| Variable | Default | Requerida |
|----------|---------|-----------|
| `VITE_API_URL` | `http://localhost:4001/api/v1` | No |

Copia `.env.example` a `.env` y ajusta si la API corre en otro puerto.

## Scripts

```bash
bun run dev             # Desarrollo (puerto 3000)
bun run build           # Build producción
bun run test            # Tests unitarios (Vitest)
bun run typecheck       # TypeScript check
bun run check           # Lint + formato (Biome)
bun run generate-routes # Regenerar route tree
bun run ci              # typecheck + check + test + build
```

Desde la raíz del monorepo: `bun run dev:admin`.

## Tests

### Unitarios (Vitest)

```bash
bun run test
bun run test:watch
```

### E2E (Playwright) — opcional

Requiere credenciales en `.env`:

```
PLAYWRIGHT_BASE_URL=http://localhost:3000
PLAYWRIGHT_ADMIN_EMAIL=admin@example.com
PLAYWRIGHT_ADMIN_PASSWORD=password123
```

```bash
bun run test:e2e
```

Sin credenciales, los tests se omiten con un mensaje explicativo.

## Estructura de carpetas

```
src/
├── components/
│   ├── data-table/     # Shell genérico de tabla
│   ├── layout/         # Sidebar, nav, header
│   └── ui/             # shadcn/Base UI
├── config/             # env, navigation, query-client
├── features/<name>/    # api, queries, forms, tables, components
├── lib/api/            # HTTP client, errors
└── routes/             # TanStack Router (thin wiring)
```

## Patrón de feature

```
features/<name>/
├── api/           # Funciones HTTP tipadas con commons
├── queries/       # Query keys + queryOptions + hooks
├── forms/         # TanStack Form (opcional)
├── tables/        # Columnas y celdas
├── components/    # Drawers, dialogs
└── index.ts       # Barrel export público
```

Las rutas importan features solo vía `@/features/<name>`.
