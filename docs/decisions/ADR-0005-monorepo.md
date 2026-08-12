# ADR-0005: Monorepo — unificación del ecosistema

- **Estado**: Aceptado
- **Fecha**: 2026-08-11

## Contexto

Existían tres repos separados: `role-api` (NestJS), `role-front-admin` (TanStack Start) y `role-commons` (contratos, publicado al registry GitHub Packages). El admin consumía `@0xc1x/role-commons@^1.0.0` publicado; la API lo consumía por `file:../role-commons` — drift real de contratos, mitigado con scripts (`commons:check`). Además el registry requería token (401 sin él). El app Flutter (fudi) se migrará a Expo.

## Decisión

**Un solo repo `role`** con bun workspaces + Turborepo: `apps/{api,admin,landing,mobile}` + `packages/commons`. Los contratos pasan a `workspace:*` (sin publicación). Flutter (fudi) queda **fuera** del monorepo hasta sunset.

## Consecuencias

- Se elimina la publicación al registry y el drift de versiones: el compilador (`bun run typecheck`) reemplaza a `commons:check`.
- Cambios atómicos: contrato + consumidores en el mismo PR.
- Los repos separados se archivan en GitHub (read-only) con banner apuntando al monorepo.
- Historial: las 3 historias (35 commits) se pueden ingestar a `apps/*` y `packages/commons` antes del primer push (git filter-repo); si no, quedan navegables en los repos archivados.
- Re-evaluar la división solo si aparece una necesidad real de control de acceso por path (vendors/equipos que no deben ver otros módulos).
