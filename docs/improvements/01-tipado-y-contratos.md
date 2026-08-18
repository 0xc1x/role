# 01 — Tipado y contratos (Zod, commons, sin interfaces duplicadas)

**Estado: aplicado en mobile y landing.**

## Problema en el original

- Tipos de dominio (Order, Offer, Coupon…) definidos en Flutter, replicados en la API y
  en la base — tres versiones de la misma verdad, divergiendo silenciosamente.
- Los repos de Supabase devolvían `Map<String, dynamic>` sin tipar; cualquier typo de
  columna era runtime error en producción.
- Sin validación en la frontera: datos de DB asumidos como válidos.

## Solución aplicada

1. **`packages/commons` es el SSOT de contratos** (Zod schemas + tipos inferidos).
   Mobile y landing consumen `@0xc1x/role-commons` vía `workspace:*`.
2. **El móvil NO redefine entidades**: solo define
   - **proyecciones PostgREST** (subtipos `Pick<>` de los tipos de commons) — el shape
     que el query `select` realmente devuelve (p. ej. `EmbeddedBusiness`).
   - **view models móvil-específicos** que agregan lógica de presentación
     (`OfferDetail`, `OrderDetail`, `BusinessProfileDetail`).
   - **modelos de dispositivo** que no existen en el backend (p. ej. `PaymentMethodModel`
     es local a AsyncStorage por diseño: los métodos de pago del original eran ficticios).
3. **Fronteras con Zod**: `env.ts` valida variables de entorno al arranque
   (ver [05-entorno.md](./05-entorno.md)).

## Cómo se verifica la paridad

`bun run typecheck` en la raíz compila commons + todos los consumidores: cambiar un
contrato rompe el compilador donde sea necesario actualizar, no en runtime.

## Mejora propuesta (pendiente de análisis)

- **Módulo `payments` en commons**: el original mostraba métodos de pago ficticios.
  Propuesta: modelar `payment_methods` como contrato real cuando exista un proveedor
  (Stripe/Conekta), reemplazando `PaymentMethodModel` local. No se hizo porque no hay
  proveedor aún (YAGNI).
