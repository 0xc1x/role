# role-landing

TanStack Start — **marketing + SEO** para que los usuarios conozcan Rolé, y **onboarding de negocios** (registro detallado; el negocio NO se activa hasta verificación manual del admin).

## Alcance

- Páginas públicas indexables (SSR — la web SEO-critical NO va a Expo web).
- Flujo de registro de negocio → insert directo a Supabase (`is_active=false`).
- Verificación: la hace el admin vía `apps/api` (módulo businesses) + `apps/admin`; el móvil/landing leen estado por RLS.

## Scaffold

Reutilizar el scaffolding de `apps/admin` (mismo stack: react-router + react-query + react-form + shadcn + biome + nitro). Plan: copiar config base (vite, router, biome, shadcn) y construir rutas propias.

```sh
# desde apps/admin: copiar vite.config.ts, tsr.config.json, biome.json, components.json, src/router.tsx
```

Consume `@0xc1x/role-commons` como `workspace:*` (BusinessCreateSchema + react-form para el onboarding).
