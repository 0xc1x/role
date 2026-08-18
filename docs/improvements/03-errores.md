# 03 — Taxonomía de errores tipada

**Estado: aplicado en mobile.**

## Problema en el original

- Errores como strings sueltos: `'No se pudo cargar'`, `'Error de red'` inline en cada
  pantalla, sin distinción de causa.
- PostgrestErrors crudos expuestos al usuario (`"duplicate key value violates unique
  constraint"`).
- Sin mapeo consistente: cada repositorio decidía su propio mensaje.

## Solución aplicada

1. **`AppError` tipado** en `src/core/error/app-error.ts`:
   - categorías: `notFound`, `unauthorized`, `network`, `validation`, `conflict`,
     `unknown`.
   - transporta `cause`, `code` y mensaje amigable.
2. **`toAppError(error, fallback)`** en `src/core/error/mapper.ts`:
   - PostgrestError → categoría (23505 unique → conflict, 42501 → unauthorized, …).
   - errores de red → network.
   - fallback siempre presente: nunca se muestra `undefined`.
3. **UI consistente**: `ErrorState` recibe el error tipado y muestra mensaje + retry.
4. **Sentry** (`src/core/analytics`): `trackError` registra categoría + stack en el
   entorno configurado (ver [05-entorno.md](./05-entorno.md)).

## Por qué es una mejora

- El usuario ve mensajes de dominio en español, no SQL crudo.
- El equipo puede filtrar errores por categoría en Sentry.
- Los tests pueden afirmar sobre categorías, no sobre substrings.

## Pendiente de decisión

- **Errores de negocio de reserva**: `reserve_offer` RPC devuelve `ReservationResult`
  (éxito/fallo tipado) en vez de lanzar. Es deliberado: es un flujo transaccional con
  estados de negocio (sin stock, fuera de horario…). Revisar si conviene uniformarlo con
  AppError para el resto de RPCs.
