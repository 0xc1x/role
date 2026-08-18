# Rolé — Landing (`apps/landing`)

TanStack Start (SSR) — **marketing + SEO** para que los usuarios conozcan Rolé, y
**onboarding de negocios** (registro; el negocio NO se activa hasta verificación manual
del admin).

## Alcance

- Páginas públicas indexables (SSR — la web SEO-critical NO va a Expo web).
- Flujo de negocio: CTA a `role://business-signup` (deep link a la app) + contacto
  `mailto:negocios@role.app`.
- Verificación: la hace el admin vía `apps/api` (módulo businesses) + `apps/admin`;
  el móvil/landing leen estado por RLS.

## Stack

- `@tanstack/react-start` + `@tanstack/react-router` (file-based routes) + React Query.
- Tailwind CSS v4 con tokens Rolé en `@theme` (`--color-role-*`), fuentes
  Outfit/DM Sans vía Google Fonts.
- Biome (formatter + linter), Vitest, TypeScript estricto.
- Consume `@0xc1x/role-commons` como `workspace:*`.

## Estructura

```
src/
├── components/       # Secciones reutilizables (Navbar, Hero, FAQ, Footer…)
├── lib/              # query-client, etc.
├── routes/           # Rutas file-based: /, /about, /how-it-works, /for-business,
│                     #   /help-center, /privacy, /terms (+ 404 en __root)
└── styles.css        # Tokens + base (Tailwind)
```

## Comandos

```sh
bun run dev            # vite dev :3001
bun run typecheck      # tsc --noEmit
bun run build          # vite build (SSR nitro)
bun run test           # vitest
bun run check          # biome check
```

Nota: `routeTree.gen.ts` se regenera con `bunx tsr generate` (ya en el repo).

## Reglas

- Contenido de marketing centralizado en arrays de datos por sección, no inline duplicado.
- Deep links a la app usan `role://` (scheme ADR-0003).
- El nombre de producto es **Rolé** (acento en la e) en todos los textos.
