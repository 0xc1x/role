# Mejoras aplicadas en la reescritura Flutter → Expo

Este directorio documenta las mejoras (y decisiones deliberadas) introducidas al portar
la app Flutter (fudi → **Rolé**) a Expo en el monorepo. El objetivo es que las mejoras
queden auditables y se pueda decidir después si mantenerlas, revertirlas o profundizarlas.

| Doc | Tema |
| --- | --- |
| [01-tipado-y-contratos.md](./01-tipado-y-contratos.md) | Zod en fronteras, tipos desde commons, sin interfaces duplicadas |
| [02-estado-y-datos.md](./02-estado-y-datos.md) | TanStack Query vs setState, Zustand para estado de sesión |
| [03-errores.md](./03-errores.md) | Taxonomía de errores tipada en vez de strings sueltos |
| [04-i18n.md](./04-i18n.md) | Strings centralizados y tipados en vez de literales inline |
| [05-entorno.md](./05-entorno.md) | Env validado con Zod en vez de `String.fromEnvironment` |
| [06-tema.md](./06-tema.md) | Design tokens + tema persistente claro/oscuro/sistema |
| [07-seguridad.md](./07-seguridad.md) | Sin secretos hardcodeados, proyecciones PostgREST mínimas |
| [08-codigo-muerto.md](./08-codigo-muerto.md) | Qué se eliminó del original y por qué |

## Resumen ejecutivo

La app Flutter original era una app funcional con varias deudas profesionales:

1. **Strings hardcodeados** en español dentro de cada widget (duplicados, sin centralizar).
2. **Colores/estilos inline** mezclados con el theme (varios `Color(0xFF...)` literales).
3. **Errores como strings** (`SnackBar` con texto fijo) sin tipar ni mapear a dominio.
4. **Sin capa de contratos** — tipos duplicados entre repos, DB y UI.
5. **Sin tests** — cero cobertura de la lógica de dominio (descuentos, disponibilidad, haversine).
6. **Estado mezclado** — `setState` + streams sin una estrategia clara.

La reescritura en `apps/mobile` (Expo + expo-router + TanStack Query + Zustand) y
`apps/landing` (TanStack Start) resuelve 1–6 sin cambiar el comportamiento visible
(paridad de pantallas y flujo) ni la frontera de datos (Supabase + RLS, ADR-0002).

## Cambios más notables (resumen)

| Aspecto | Flutter original | Rolé (Expo) |
| --- | --- | --- |
| Strings | Inline en cada widget | `src/core/i18n/strings.ts` tipado |
| Errores | Strings + SnackBar | `AppError` + `toAppError` |
| Env | `String.fromEnvironment` | `env.ts` con Zod, `EXPO_PUBLIC_*` |
| Tipos de dominio | Duplicados por repo | `@0xc1x/role-commons` (SSOT) |
| Estado servidor | Manual | TanStack Query |
| Estado sesión | Manual | Zustand + `watchAuthState` |
| Tests | 0 | vitest (dominio puro de ofertas/órdenes) |
| Landings | 7 pantallas Flutter separadas | SPA/SSR con rutas + deep links |

## Pendiente de decisión (ver docs por detalle)

- **Pago**: el original no tenía pago real; Rolé mantiene "pago en recogida" (pay-at-pickup).
  Ver [01-tipado-y-contratos.md](./01-tipado-y-contratos.md) para la propuesta de `payments`.
- **Verificación de negocio tri-state** (`pending/active/rejected`) — README raíz.
