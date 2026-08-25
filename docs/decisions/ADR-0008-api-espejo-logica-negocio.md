# ADR-0008: La API NestJS se convierte en espejo de la lógica de negocio de Supabase

- **Estado**: Aceptado
- **Fecha**: 2026-08-25

## Contexto

La lógica de negocio de Rolé vive hoy distribuida en Supabase:

- **RPCs** con transacciones críticas (`reserve_offer`: stock, anti-duplicados, cupones, comisión; `cancel_order`; `validate_pickup_code`).
- **Triggers** con reglas de negocio (acumulación de earnings, recálculo de ratings, expiración de ofertas, defaults al crear usuarios, folios y códigos).
- **Cron jobs SQL** (`generate_payouts`, `cleanup_old_device_tokens`).
- **Edge Functions** con el pipeline de notificaciones (8 funciones) y pagos.

Esto acopla la lógica de negocio a la plataforma: es difícil de testear unitariamente, versionar y evolucionar, y ata el producto a Supabase más allá de lo deseable. El objetivo estratégico es que, a futuro, Supabase provea **solo la base de datos alojada y la autenticación**. La API NestJS ya existe como base (Drizzle, validación JWT con jose, estructura de módulos por dominio).

## Decisión

**La API NestJS se convierte en espejo de toda la lógica de negocio que hoy vive en Supabase**, con alcance de migración hasta la fase 2.3 del roadmap (`docs/roadmap-api-mirror.md`). Durante toda la implementación, **Supabase sigue operando sin cambios**: triggers, RPCs, edges y crons permanecen activos y son la fuente activa mientras el móvil consuma Supabase directamente (según ADR-0002).

Reglas de la migración:

1. **Contratos primero en `commons`**: entities, enums y DTOs/zod schemas nuevos se definen en `packages/commons/src/<dominio>/{entities,enums,schemas,dtos}` (SSOT). La API no declara tipos duplicados.
2. **Espejo dormido**: los servicios del API implementan y testean la equivalencia con el comportamiento SQL actual, pero solo se activan para flujos que pasen por el API. No hay doble escritura ni doble push.
3. **Convivencia por módulo, con flag**: cada módulo migrado se activa de forma independiente cuando su flujo correspondiente pase por el API.
4. **Fuera de alcance** (trabajo futuro, documentado en el roadmap): baja de triggers/RPCs/edges/crons de Supabase, migración del móvil a la API, y migración de Auth.

## Consecuencias

- **Doble implementación temporal** (SQL activo + espejo en API): aceptada y mitigada con **tests de equivalencia** que validan el mismo comportamiento para los mismos casos (stock insuficiente, duplicados, cupón agotado, mínimo no alcanzado, etc.).
- **Sin doble push**: el espejo de notificaciones está dormido para flujos del móvil; los triggers/edges siguen siendo los únicos emisores hasta el cutover futuro.
- **Drift SQL ↔ API**: si el SQL cambia sin actualizar el espejo (o viceversa), los tests de equivalencia lo detectan — son la red de seguridad de esta decisión.
- **Secuencia diaria del folio**: el `MAX + 1` del SQL requiere lock en el API (`SELECT ... FOR UPDATE` o secuencia dedicada) para evitar colisiones concurrentes.
- **La DB no queda "solo Postgres" hasta la fase 5 del roadmap**: los triggers de negocio persisten mientras el móvil consuma directo.
- Revisar esta decisión al iniciar el cutover (fase 2.4 del roadmap) o si el costo de mantener el espejo supera el beneficio antes de llegar allí.
