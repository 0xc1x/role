# Role Front Admin — Agent Guide (TanStack)

Guía de agente de `apps/admin`, alineada al ecosistema TanStack. La raíz del monorepo (`AGENTS.md`) define las reglas globales.

## Rol en el ecosistema

Panel de administración de Rolé: negocios, órdenes, ofertas, slides, categorías. SPA + SSR (TanStack Start), consume la API REST (`VITE_API_URL`, default `http://localhost:4001/api/v1`) y los contratos de `commons` para tipar.

## Stack

| Capa | Librería |
|---|---|
| Framework | TanStack Start (React 19) |
| Routing | TanStack Router (file-based) |
| Server state | TanStack Query |
| Forms | TanStack Form |
| Tables | TanStack Table |
| Styles | Tailwind 4 + shadcn/Base UI |
| HTTP | `fetch` nativo |
| Tipos | `@0xc1x/role-commons` (`workspace:*`) |
| Lint/Format | Biome |
| Tests | Vitest + Playwright |

## Estructura (feature-first)

```
src/
├── routes/            # file-based; routeTree.gen.ts es GENERADO — no editar
├── features/<dominio>/  # {api, forms, hooks, queries, tables}
├── components/ui/     # shadcn/Base UI
├── lib/api/           # capa HTTP profesional (client, errors)
├── config/env.ts
└── hooks/
```

## Convenciones (no inventar — seguir `IMPLEMENTATION_GUIDE.md`)

- **Resource module** (patrón obligatorio): feature = api + queries (query keys/`queryOptions`) + table/form.
- **Forms con react-form + zod**: los schemas vienen de `commons` — la fuente de verdad es el contrato, no dupliques campos.
- **No editar `routeTree.gen.ts`**: corre `bun run generate-routes`.
- **Lint/format**: Biome (`bun run check`), no prettier/eslint.
- Fuente de verdad de tipos = schemas/DTOs de `@0xc1x/role-commons`; si falta un campo, se actualiza el contrato en `packages/commons` (ver `docs/contracts.md`).

## Comandos

```sh
bun run dev             # Vite dev (:3000)
bun run build           # build producción (vite + nitro)
bun run generate-routes # regenerar route tree
bun run test            # vitest
bun run test:e2e        # playwright
bun run typecheck       # tsc --noEmit
bun run check           # biome (lint + format)
```

## Verificación antes de declarar done

```sh
bun run typecheck && bun run check && bun run test
```

## Estado conocido (fix pendiente)

3 errores de typecheck pre-existentes (no causados por el wiring del monorepo; surfaced por el lockfile fresco):

1. `src/components/ui/color-picker.tsx` — tipo `number | readonly number[]` de base-ui no asignable a `number`.
2. `src/features/slides/forms/slide.form.tsx` — **drift de contrato**: `commons` (HEAD) hizo `badge_text` nullable (commit `d561ee8`) y el form espera `string` — alinear el form al contrato.
3. `vite.config.ts` — `rollupConfig` eliminado de la API de nitro-nightly.

Hasta que se corrijan, `bun run typecheck` global falla en este paquete (build sí pasa). Corregir en orden: contrato → form → dependencias.
