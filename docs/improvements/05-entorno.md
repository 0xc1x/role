# 05 — Configuración de entorno validada

**Estado: aplicado en mobile. Landing usa env de Vite estándar.**

## Problema en el original

- `AppEnvironment` leía `String.fromEnvironment` (compile-time) con valores por
  defecto silenciosos; si faltaba una variable, la app corría con config rota
  (p. ej. URL vacía de Supabase) y fallaba raro en runtime.

## Solución aplicada

1. **`src/core/config/env.ts`** (mobile):
   - schema Zod: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
     `EXPO_PUBLIC_ENVIRONMENT`, `EXPO_PUBLIC_SENTRY_DSN` (opcional), etc.
   - parse al arranque: arranque falla rápido y claro si falta una variable.
   - `isProd` derivado de `EXPO_PUBLIC_ENVIRONMENT` (no de `__DEV__`, que puede
     mentir en builds de preview).
   - `.env.example` documenta las variables; `.env*` en `.gitignore`.
2. **Sin secrets en código**: ninguna URL/key de producción en el repo (ADR
   seguridad). Los keys anon son públicos por diseño en Supabase, pero viven solo en
   `.env` local / EAS secrets.

## Pendiente de decisión

- **Landing**: usa `import.meta.env` de Vite (patrón estándar). Evaluar si conviene
  también un schema Zod para las variables públicas de la landing
  (`EXPO_*` no aplican; `VITE_*` sí) cuando la landing tenga integraciones reales
  (formulario de negocio → Supabase).
