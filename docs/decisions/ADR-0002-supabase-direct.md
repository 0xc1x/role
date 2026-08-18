# ADR-0002: La app móvil se comunica directo con Supabase

- **Estado**: Aceptado
- **Fecha**: 2026-08-11

## Contexto

El app Flutter original (Rolé v1) consume Supabase directamente (queries + RLS). La API NestJS existe como BFF para admin/landing. La pregunta era si el móvil debía pasar por la API como intermediaria.

## Decisión

**El móvil consume Supabase directo** (mismas queries y RLS). La API es BFF de admin/landing y NO intermediaria del móvil. Supabase sigue siendo la fuente de verdad de schema Postgres y Auth.

## Consecuencias

- Zero rediseño de datos: las queries/RLS del app Flutter se portan tal cual a supabase-js en Expo.
- La API posee las reglas de negocio que no deben vivir en cliente (stock, ciclo de órdenes, pagos futuros).
- Los contratos de `commons` sirven para validación client-side y tipos; el `openapi.json` queda disponible si algún día se generan clientes.
- Revisar esta decisión si el móvil necesita lógica transaccional que no puede ir en RLS/función de borde.
