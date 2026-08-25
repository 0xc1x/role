# Roadmap: API como espejo de la lógica de negocio de Supabase

- **Estado**: Planificado (Fases 1–2, hasta 2.3)
- **ADR relacionado**: [ADR-0008](./decisions/ADR-0008-api-espejo-logica-negocio.md)
- **Principio rector**: Supabase sigue operando sin interrupciones durante toda la migración. Triggers, RPCs, edges y crons permanecen activos; el API implementa el espejo con tests de equivalencia y se activa por módulo cuando el flujo pase por el API.

## Convención de implementación

1. **Contratos primero en `packages/commons`** (SSOT): entities, enums y DTOs/zod schemas nuevos en `src/<dominio>/{entities,enums,schemas,dtos}`. Tipos derivados con `z.infer` — nada duplicado en el API.
2. **Estructura de módulos Nest** (patrón existente del API): `src/modules/<dominio>/{controller,service,mapper}` + jobs con `@nestjs/schedule`.
3. **Mappers por módulo**: nunca exponer filas de DB crudas.
4. **Tests de equivalencia** por servicio: los mismos casos que cubre el SQL actual (felices + bordes) deben producir el mismo resultado.
5. **Flags por módulo** (`ENABLE_API_MIRROR_ORDERS`, etc.): el espejo se activa por flujo cuando su cutover llegue (fase 2.4, fuera de alcance de este roadmap).

## Inventario de lógica a espejar

| Origen en Supabase | Lógica | Fase |
|---|---|---|
| RPC `reserve_offer` | Transacción: stock, anti-duplicados, cupón, comisión, orden + evento | 1.1 |
| RPC `cancel_order` / `validate_pickup_code` | Transiciones y validación de recogida | 1.1 |
| Función `generate_order_number` | Folio `FD-YYYY-MMDD-NNN` (secuencia diaria) | 1.1 |
| Función `generate_pickup_code` | Código de recogida 6 chars | 1.1 |
| Trigger `accrue_order_earnings` | Acumulación de earnings por orden | 1.2 |
| Cron `generate_payouts` | Generación de payouts (1° y 16) | 1.2 |
| Edge `process-payout` | Procesamiento de payout | 1.2 |
| Trigger `update_business_rating` / `update_offer_rating` | Recálculo de ratings | 1.3 |
| Trigger `check_offer_expiry` | Expiración de ofertas | 1.4 |
| Trigger `handle_new_user` + defaults | Profile, preferencias, consents, notificaciones al registrarse | 1.5 |
| Edge `send-push-notification` | FCM HTTP v1 + desactivación de tokens muertos | 2.1 |
| Edge `handle-order-event` | Push por cambio de estado (consumidor + negocio, con preferencias) | 2.2 |
| Edge `handle-offer-created` | Alertas de favoritos | 2.2 |
| Edge `handle-pickup-reminders` + cron horario | Recordatorios de recogida (dedupe vía `order_events`) | 2.2 |
| Edge `handle-weekly-summary` + cron semanal | Resumen semanal | 2.2 |
| Edge `dispatch-nearby-offers` + cron horario | Ofertas cercanas + `last_minute_deals_enabled` | 2.2 |
| Cron `cleanup_old_device_tokens` | Limpieza de tokens antiguos | 2.2 |

---

## Fase 1 — Espejo de la lógica de negocio

### 1.1 Módulo Orders

- `OrdersService.reserveOffer()` en `db.transaction()`: validar oferta activa/stock, anti-duplicados, cupón (validación + `used_count`), snapshot de comisión, insertar orden + evento. Devuelve el mismo contrato que el RPC (`order_id`, `order_number`, `pickup_code`, `price`, `discount`, `platform_fee`, `net_amount`).
- `OrdersService.cancelOrder()` y `validatePickupCode()`.
- `OrderNumberService.next()`: folio `FD-YYYY-MMDD-NNN` con lock (`SELECT ... FOR UPDATE` sobre la fila del día o secuencia dedicada) para concurrencia.
- `PickupCodeService.generate()`: 6 chars alfanuméricos sin caracteres ambiguos.
- Contratos en `commons/src/order/` (DTOs de request/response del espejo).

**Done**: tests de equivalencia (felices + stock insuficiente + duplicado + cupón agotado + cupón mínimo no alcanzado + ventana vencida) producen el mismo resultado que el RPC; `openapi.json` regenerado.

### 1.2 Módulo Payouts

- `EarningsService.accrueForOrder()` (espejo del trigger) + `PayoutsService.generate()` como job quincenal (1° y 16) — espejo del cron SQL.
- Port del edge `process-payout` a endpoint/job del API.

**Done**: para un dataset de prueba, earnings y payouts generados idénticos al SQL; job agendado en `@nestjs/schedule`.

### 1.3 Módulo Reviews

- `ReviewsService.recalculateRatings(businessId|offerId)` idempotente (espejo de los triggers de rating), llamado al crear review vía API.

**Done**: crear review vía API produce los mismos promedios y `review_count` que el trigger.

### 1.4 Módulo Offers

- `OffersService.expireStale()` como job programado (espejo de `check_offer_expiry`).

**Done**: ofertas sin stock o con ventana vencida quedan `is_active = false` tras el job.

### 1.5 Módulo Users

- Defaults al registrar (espejo de `handle_new_user` + `create_user_preferences` + `create_default_consents` + preferencias de notificación): llamado desde el endpoint de registro del API.

**Done**: registrar un usuario vía API crea las mismas filas por defecto que el flujo actual.

---

## Fase 2 — Notificaciones en el API

### 2.1 NotificationService

- `NotificationsService.send(userIds, title, body, data, type)`: OAuth2 service account → FCM HTTP v1, links absolutos, desactivación de tokens muertos (port 1:1 de la edge `send-push-notification`).
- Credenciales en variables de entorno del API (`FCM_SERVICE_ACCOUNT`).

**Done**: test E2E — push llega a un token registrado activo; token inválido se desactiva.

### 2.2 Handlers espejo (listeners/jobs)

| Handler | Disparador en el API | Preferencias que respeta |
|---|---|---|
| `onOrderStatusChanged` | Al cambiar estado desde endpoints de orders | `push_enabled` (consumidor) / `push_enabled` (negocio) |
| `onOfferCreated` | Al publicar oferta desde endpoints de offers | `push_enabled` + `favorite_alerts_enabled` |
| Pickup reminders job (horario) | `@nestjs/schedule` | `push_enabled` + `pickup_reminders_enabled` (dedupe vía `order_events`) |
| Weekly summary job (domingo) | `@nestjs/schedule` | `push_enabled` + `weekly_summary_enabled` |
| Nearby offers job (horario) | `@nestjs/schedule` | `last_minute_deals_enabled` + radio/categorías |

**Done**: cada handler con test de filtros de preferencias (sin fila = permitido; `false` = excluido).

### 2.3 Emisión desde los flujos del API

- Los endpoints de Fase 1 invocan a los handlers al completar su transacción (emisión directa).
- BullMQ documentado como upgrade si se requiere reintento/desacoplamiento.

**Done**: flujo API → push recibido en dispositivo de prueba.

---

## Fuera de alcance (trabajo futuro)

- **2.4 Cutover**: bajar triggers/RPCs/edges/crons de Supabase y activar los flags del espejo. Requiere antes: Fase 3 (móvil → API) o al menos que ningún flujo del móvil dependa del SQL.
- **Fase 3**: módulos BFF del consumidor + revocación de PostgREST directo.
- **Fase 4**: Auth fuera de Supabase.

Criterio de arranque del cutover: cuando el API cubra el 100% de los flujos que el móvil necesite (Fase 3 ejecutada) y los tests de equivalencia lleven una temporada en verde.
