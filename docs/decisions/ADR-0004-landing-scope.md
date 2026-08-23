# ADR-0004: Landing = marketing/SEO + onboarding de negocios

- **Estado**: Aceptado
- **Fecha**: 2026-08-11

## Contexto

La web SEO-critical no debe ir a Expo web (débil en SEO/fidelidad). El admin ya es TanStack Start, lo que hace natural una segunda app Start para la landing.

## Decisión

**`apps/landing` (TanStack Start, SSR)** cubre: marketing + SEO (que los usuarios conozcan Rolé) + **onboarding de negocios**: registro detallado desde la landing; el negocio NO se activa hasta verificación manual del admin.

## Consecuencias

- Registro → insert directo a Supabase con `is_active=false`; verificación por admin (admin → API); visibilidad por RLS.
- El consumer web completo (explore/offers) NO vive en la landing: el app consumer es mobile-first en Expo.
- El scaffolding reutiliza la config de `apps/admin` (router, query, form, shadcn, biome, nitro).
- **Pendiente**: tri-state de verificación (`pending/active/rejected` + auditoría) vs `is_active` boolean — decidir antes de congelar schemas.
