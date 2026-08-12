# ADR-0001: Package manager — bun

- **Estado**: Aceptado
- **Fecha**: 2026-08-11

## Contexto

Los repos heredados (`role-api`, `role-front-admin`) ya usaban bun (`bun.lock`, `packageManager: bun@1.2.0`). El monorepo necesita un solo package manager y un solo lockfile. Expo soporta bun oficialmente (EAS detecta el PM por lockfile); el único riesgo documentado era la resolución de workspaces en Metro, mitigado consumiendo `commons` compilado.

## Decisión

**bun** como package manager único del monorepo. Un solo `bun.lock` en la raíz. `workspace:*` para dependencias internas.

## Consecuencias

- Nada de `package-lock.json` ni npm/pnpm/yarn en ningún app (los heredados fueron depurados).
- Node.js LTS sigue siendo requisito para `bun create expo-app` y `bun expo prebuild`.
- `trustedDependencies: ["@sentry/cli"]` necesario en el app mobile (postinstall para source maps).
- EAS Build usa bun automáticamente al detectar `bun.lock`.
