# role-front-admin

Admin SPA de **Role** — panel de administración construido con TanStack Start + Query + Form + Table.

## Arquitectura e implementación

- **Auditoría actual + plan de refactor (2026-07-21):** [ARCHITECTURE_AUDIT.md](./ARCHITECTURE_AUDIT.md) — verificación estructural, hallazgos priorizados y fases accionables para otro agente.
- **Contratos API role-commons (2026-07-21):** [COMMONS_API_CONTRACTS_GUIDE.md](./COMMONS_API_CONTRACTS_GUIDE.md) — análisis de DTOs/schemas, parse de respuestas, plantilla para features y servicios futuros.
- **Guía histórica de implementación (2026-07-20):** [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) — contexto original; gran parte ya aplicada. Usar el audit para el trabajo pendiente.

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
| Tipos compartidos | `@0xc1x/role-commons` |
| Lint / Format | Biome |
| Tests | Vitest + Playwright |

## Requisitos

- [Bun](https://bun.sh) >= 1.2 (package manager único)
- `role-api` corriendo (ver su README para setup)
- `role-commons` por `workspace:*` (monorepo) — nada que linkear

## Variables de entorno

| Variable | Default | Requerida |
|----------|---------|-----------|
| `VITE_API_URL` | `http://localhost:4001/api/v1` | No |

Copia `.env.example` a `.env` y ajusta si tu API corre en otro puerto.

## Scripts

```bash
bun run dev             # Desarrollo (puerto 3000)
bun run build           # Build producción
bun run test            # Tests unitarios (Vitest)
bun run typecheck       # TypeScript check (tsc --noEmit)
bun run check           # Lint + formato (Biome)
bun run format          # Formatear código
bun run lint            # Solo lint
bun run generate-routes # Regenerar route tree
bun run ci              # typecheck + check + test + build
```

> ℹ️ Este proyecto usa **Bun** como package manager único.
> No hay `package-lock.json` ni `pnpm-lock.yaml`.
> Los scripts de CI asumen `bun install --frozen-lockfile`.

## Tests

### Unitarios (Vitest)

```bash
bun test
bun run test:watch  # modo watch
```

### E2E (Playwright) — opcional

Requiere credenciales de test configuradas en `.env`:

```
PLAYWRIGHT_BASE_URL=http://localhost:3000
PLAYWRIGHT_ADMIN_EMAIL=admin@example.com
PLAYWRIGHT_ADMIN_PASSWORD=password123
```

```bash
bun run test:e2e
```

Si no hay credenciales, los tests se saltan automáticamente con un mensaje explicativo.

## Estructura de carpetas

```
src/
├── components/
│   ├── data-table/          # Componentes reutilizables de tabla (shell genérico)
│   ├── layout/              # Layout principal (sidebar, nav, header, logo)
│   ├── media/               # Componentes de imágenes (field, thumbnail)
│   └── ui/                  # shadcn/Base UI primitives
├── config/
│   ├── env.ts               # Validación de env vars con Zod
│   ├── navigation.ts        # Datos de navegación del sidebar
│   └── query-client.ts      # Factory de QueryClient
├── features/
│   ├── auth/                # Auth feature (api, queries, forms, guards)
│   └── categories/          # Categories feature (api, queries, forms, tables, components)
├── hooks/                   # Hooks transversales de UI
├── lib/
│   ├── api/                 # Transporte HTTP (client, errors, helpers)
│   └── utils.ts             # Utilidades genéricas (cn)
└── routes/                  # TanStack Router file-based routes (thin: solo wiring)
    ├── __root.tsx
    ├── _layout.tsx
    ├── _layout.home.tsx
    ├── _layout.categorias.tsx
    ├── index.tsx
    ├── login.tsx
    └── signup.tsx
```

## Features

Cada feature sigue la misma estructura (ver [contrato §4.4](ARCHITECTURE_AUDIT.md#44-contrato-de-un-feature-checklist-al-crear-uno-nuevo)):

```
features/<name>/
├── api/           # Funciones de API puras tipadas con commons
├── queries/       # TanStack Query keys + queryOptions + hooks
├── forms/         # TanStack Form components (opcional)
├── tables/        # TanStack Table columns + cells (NO el shell genérico)
├── components/    # Drawers, dialogs del feature
├── utils/         # Opcional
└── index.ts       # API pública del feature (solo barrel exports)
```

> Las rutas importan features **solo** vía `@/features/<name>` (barrel).
> El DataTable shell genérico vive en `components/data-table/`.
