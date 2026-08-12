# Rolé Monorepo — Operating Guide

Monorepo bun workspaces + Turborepo para el ecosistema Rolé (móvil Expo, landing y admin TanStack Start, API NestJS, contratos en role-commons).

## Antes de trabajar

- `README.md` (raíz) — mapa, decisiones de arquitectura, comandos.
- `AGENTS.md` / `CLAUDE.md` en `packages/role-commons/` (convenciones propias del paquete).
- Docs de cada app (`apps/api/README.md`, `apps/admin/README.md`, `apps/api/IMPROVEMENT_PLAN.md`).

## Reglas

- **Nunca agregues `Co-Authored-By` ni atribución de IA en commits.**
- Conventional commits.
- `role-commons` es la fuente de verdad de contratos: un cambio de schema se valida con `bun run typecheck` (el compilador rompe donde toca) — no con `commons:check` manual.
- La app móvil y la API consumen Supabase directo; la capa API NO es intermediaria del móvil.
- No crear nuevos paquetes en `packages/` sin consumidor real (un `role-commons` con carpetas de dominio adentro es suficiente; se divide solo si el grafo lo exige).

## Verificación obligatoria antes de declarar done

```sh
bun run typecheck
bun run test
bun run build
```

Nada de builds de stores (EAS/App Store) en el flujo de desarrollo.
