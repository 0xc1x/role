# 08 — Código muerto y deuda eliminada

**Estado: aplicado en mobile y landing (la app Flutter original no se toca).**

## Qué se eliminó en la reescritura (vs. el original)

1. **Pantallas de pago ficticio**: el original mostraba métodos de pago inventados
   (tarjetas de ejemplo). Rolé usa **pago en recogida** (pay-at-pickup) y el modelo
   local `PaymentMethodModel` solo para prefs de dispositivo — sin backend de pagos
   falso. Ver [01-tipado-y-contratos.md](./01-tipado-y-contratos.md).
2. **`String.fromEnvironment` + config duplicada** → `env.ts` con Zod
   (ver [05-entorno.md](./05-entorno.md)).
3. **Spinners/error-handling por pantalla** → `LoadingView`/`ErrorState`/`EmptyState`
   compartidos.
4. **Literales de color/fuente inline** → tokens (ver [06-tema.md](./06-tema.md)).
5. **Texto duplicado entre landing y app** → catálogo `strings.ts` compartido
   (ver [04-i18n.md](./04-i18n.md)).
6. **Ceros de tests** → vitest sobre lógica de dominio pura:
   `discountPercentage`, `haversineKm`, `isOfferAvailable/OutOfStock/Expired`,
   transiciones de estado de órdenes, helpers de cupones.

## Lo que NO se portó (deliberado, no olvidado)

| Elemento original | Decisión |
| --- | --- |
| Login social (Google/Apple) | Diferido: auth por email/password + reset existe; social requiere credenciales de proveedor |
| Push de Supabase (Realtime) para órdenes | El móvil usa polling de Query + notificaciones locales; Realtime requiere config de Supabase Realtime — no activo en el entorno actual |
| Pantalla de "lugares guardados" con mapa | Se portó CRUD de direcciones sin mapa (react-native-maps instalado, mapa diferido a cuando haya geocoding real) |
| i18n multi-idioma | es-MX monolingüe hoy (ver [04-i18n.md](./04-i18n.md)) |

## Deuda conocida (con `ponytail:` o comentario en código)

- `payment-methods` local: se reemplaza cuando exista proveedor de pagos.
- Polling de órdenes: revisar a Realtime cuando Supabase Realtime esté habilitado.
