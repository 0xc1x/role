# Auditoría de consultas — Rolé (2026-09)

Revisión de queries en las tres superficies que tocan la base (mobile → Supabase directo, API → drizzle para admin/landing) tras la migración del catálogo a RPCs PostGIS (ADR-0010). Complementa a `docs/decisions/ADR-0010-geo-queries-postgis-rpc.md`.

## Hallazgo transversal: el espejo drizzle no declara los índices reales

La auditoría inicial reportó "cero índices en orders/reviews/device_tokens/etc." leyendo el espejo (`apps/api/src/database/schema/`). **La base real sí los tiene** (creados desde Supabase, dueño del DDL): `orders` tiene 8 (user, business, offer, status, created_at, order_number, coupon_id, pickup_code parcial), `order_events` 3, `reviews` 5, `favorites` 3, `device_tokens` 3, `payouts` 3, `coupons` 4, `businesses` 5, `business_locations` 4 + GIST, `offers` 6 + parcial activo, `email_sends` 8, `push_notifications` 1, `saved_addresses`/`user_preferences` 1-2.

Consecuencia: la migración de índices planeada para esta fase se canceló (todo lo que iba a crearse ya existía). Acción de mantenimiento: cuando se toque el espejo, sincronizarlo con `bun run db:pull` para que deje de mentir sobre los índices.

## Aplicado en esta fase

### Mobile (PostgREST → RPC de agregación, patrón ADR-0010)

| Query anterior | Problema | Reemplazo |
| --- | --- | --- |
| `getCategoryStats` | 2 queries: 1 fila por oferta activa con sus categorías embebidas, conteo en JS | RPC `active_offer_category_counts()` |
| `getPopularAreas` | `.limit(5000)` filas con embed de ubicación + haversine por fila, conteo en JS | RPC `popular_zones(lat, lng, radio)` (ST_DWithin + group by) |
| `getUserStats` | Todo el historial de órdenes para sumar `original_price - price` en JS (llamado 2×: perfil + banner home) | RPC `user_order_stats(user_id)` |
| `getBusinessProfile` (totalRescued) | Traía todos los ids de órdenes completadas para `.length` | RPC `business_completed_orders_count(business_id)` |
| `getBusinessStats` | 2 fetches de todas las órdenes del período (+embed offers) para agregar revenue/top-products/daily en JS | RPC `business_sales_stats(business_id, from, to)` — devuelve conteo, revenue, top 5 (jsonb) y serie diaria UTC (jsonb); el cliente re-arma buckets semanales/mensuales y etiquetas como antes |

Nota de semántica: `dailyStats` agrupaba por día **local del device**; la DB agrega por día **UTC** (frontera de bucket distinta para pedidos cerca de medianoche). El bucketing presentación (día/semana/mes + etiquetas) sigue siendo cliente.

Eliminado (código muerto / riesgo latente): `getAllActiveOffers`, `useActiveOffers`, `fetchActive`, `activeQuery`, `OFFER_SELECT_INNER_CATEGORIES`.

### API (NestJS + drizzle)

| Hallazgo | Archivo | Fix |
| --- | --- | --- |
| `GET /offers` (público landing) filtraba geo con haversine en SQL — seq-scan + trigonometría por fila, no usa el GIST | `offers.repository.ts buildFilters` | `extensions.st_dwithin(business_locations.geog, punto, radio*1000)` (columna cruda: no está en el espejo, ver nota arriba) |
| `GET /offers/random` (hero landing): `ORDER BY random()` full-scan por request | `offers.service.ts getRandom` | Cache en memoria 60s |
| `GET /stats/platform` (público): 3 `count(*)` por request | `stats.service.ts` | Cache en memoria 60s |
| Quiet-hours: 1 SELECT por usuario en cada fanout push | `notifications.repository.ts` | `filterNotInQuietHours(userIds)` — 1 query con `inArray` + evaluación en JS; `isInQuietHours` eliminado |
| pickup-reminders: 1 SELECT de dedupe por candidato, candidatos sin tope | `notification.handlers.ts` | Dedupe en 1 query (`inArray` + Set) + `.limit(500)` a candidatos |
| Campañas: re-render leía plantilla+header+footer (3 SELECT) por destinatario (~150 queries/lote de 50) | `campaigns.service.ts` | `loadParts` una vez por campaña (`renderWithParts` sync); transactionals cachean partes por `template_id` dentro del lote |
| Código muerto sin límite: `listPendingOrReadyWithEndedPickup`, `listExpirableIds` | `orders.repository.ts` (+spec) | Eliminados |

### Verificado y NO requiere acción

- Todos los listados admin/públicos de la API ya paginan (`page/limit ≤ 100` con `count` en DB).
- Sin N+1 reales en mobile (los `Promise.all` de `getBusinessProfile`/`getBusinessStats` ya paralelizaban).
- `reserve_offer` / `cancel_order` / `validate_pickup_code` (móvil) y el espejo transaccional de la API: correctos con locks en orden.
- Índices de `orders`/`order_events`/`reviews`/`device_tokens`/etc.: ya existen (ver hallazgo transversal).

## Backlog (fases siguientes, priorizado)

### Fase 2 — paginación de historiales (PR aparte, toca UI)

- **HIGH** `getUserOrders` / `getBusinessOrders` (mobile): historial completo sin límite con `order_events` embebidos (1→N) y re-orden en cliente (`mapStatusEvents`). Paginar con infinite scroll (`useFilteredOffersInfinite` como patrón) y traer eventos solo en `getOrderById`. El negocio además re-fetchea todo en cada cambio de estado.
- **HIGH/MEDIUM** perfil del consumidor: hasta 3 lecturas completas de `orders` por mount (historial + resumen `getUserOrders` del perfil + stats). Consolidar o cachear.
- **MEDIUM** favoritos: doble fetch (ids + lista completa con embed triple) en dos caches; unificar.

### Fase 3 — transaccionales y jobs (requiere diseño cuidadoso)

- **HIGH** `nextOrderNumber` (API): advisory xact-lock serializa TODAS las creaciones de órdenes del día; evaluar folio por secuencia o lock por oferta.
- **HIGH** `pickupReminders`/`weeklySummary`/`dispatchNearbyOffers` (API): fanout 1 usuario por vez con N queries por usuario dentro del loop; agrupar destinatarios por campaña/tipo y vectorizar envío.
- **MEDIUM** `PayoutsRepository.generate`: O(negocios × escaneos de orders) en una transacción bimensual; recomputar balance con CTE única.
- **MEDIUM** `expireStaleOrders`: 1 transacción de 4 queries por candidato, serial cada minuto; batchear con locks ordenados.
- **MEDIUM** segmentos dinámicos: hasta 50k ids en memoria + `inArray` de 50k parámetros (`findIdsMatchingFilters`); pasar filtros a SQL puro (nota ya presente en el código).
- **MEDIUM** `POST /contact` (público): 6-8 queries secuenciales por submit (config + plantilla 2×).
- **MEDIUM** `auth.service.register`: insert en `profiles` sin `onConflictDoNothing` (compite con el trigger `handle_new_user`); además 3 inserts secuenciales sin transacción.
- **LOW** `email_sends` sin índice en `created_at` (listado admin); ILIKE `%term%` sin trigram en admin (profiles/businesses/email); `orderBy random()` en tips; `app-store.updateStatus` read-modify-write del jsonb; `generateUniqueSlug` hasta 5 queries.

## Método

- Diagnóstico por auditoría estática (2 pasadas exhaustivas con file:line) + verificación contra catálogo real (`pg_indexes`, `pg_stat_user_tables`).
- Cada RPC nuevo se validó contra la base real comparando con la semántica anterior (conteos/sumas directas) y con RLS activa como rol `authenticated`.
- Los fixes de API mantienen contratos: specs jest actualizados (1231 pass), mobile 108 tests.
