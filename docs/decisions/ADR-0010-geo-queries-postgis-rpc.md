# ADR-0010: Filtrado geoespacial en Postgres (PostGIS + RPC)

- **Estado**: Aceptado
- **Fecha**: 2026-09-05

## Contexto

El catálogo del móvil (`offersRepository`) traía **todas** las ofertas activas con un select PostgREST y filtraba distancia (haversine) en el cliente. Tres problemas escalando:

1. **Cap silencioso de la API**: Supabase limita las respuestas a 1.000 filas por defecto (`db-max-rows`) y devuelve HTTP 200 sin aviso al truncar. Pasado el umbral, el filtro client-side operaba sobre un set incompleto: ofertas dentro del radio quedaban fuera por posición de fila, no por distancia.
2. **Multiplicación por sección**: la home disparaba ~5 fetches del set completo (populares, recientes, por expirar, cerca de ti, negocios cercanos), cada fila con business + ubicación + categorías embebidas.
3. **Sin índices**: `offers` y `business_locations` no tenían ningún índice; cada consulta era seq scan.

PostgREST no puede expresar "distancia haversine ≤ radio" con filtros de columnas, por eso el filtrado vivía en el cliente. PostGIS está disponible en Supabase y ya existía el patrón móvil → `supabase.rpc` (`reserve_offer`, `get_platform_stats`).

## Decisión

**El filtrado geoespacial, el orden y la paginación viven en la base de datos** vía dos funciones SQL `SECURITY INVOKER` (RLS del caller aplica igual que en los selects):

- `public.active_offers_near(p_lat, p_lng, p_radius_km, p_category_id, p_sort, p_expiring_within_hours, p_max_price, p_search, p_limit, p_offset)` — ofertas activas compuestas (offer + business + location + categories como jsonb con los mismos subcampos que el `OFFER_SELECT` del móvil) + `distance_km`.
- `public.active_businesses_near(p_lat, p_lng, p_radius_km, p_search, p_type, p_sort, p_limit, p_offset)` — negocios deduplicados con la ubicación más cercana, `active_deals_count` y `distance_km`.

Infraestructura:

- `postgis` instalado en schema `extensions` (oculto de la API pública).
- `business_locations.geog`: columna **generada** `geography(point, 4326)` desde lat/lng existentes (sin migración de datos) + índice GIST.
- `offers_active_idx`: índice parcial `offers(created_at desc, pickup_end) where is_active and stock > 0`.

Convenciones:

- **Radio como parámetro, no query de preferencias**: la función recibe `(lat, lng, radio)`; el móvil resuelve `notification_radius_km` + dirección default (`useRadiusParams`). Mantiene la función genérica (home, explore, mapa) y evita acoplarla a `user_preferences`. Con `p_lat/p_lng/p_radius_km` null no hay filtro geo (fallback global, mismo comportamiento que sin dirección).
- `p_lat/p_lng` null ⇒ `distance_km` null; el orden `distance` cae a `created_at desc` / `deals desc`.
- Búsqueda server-side sobre `title`, `description` **y `business.name`** (el nombre antes se filtraba en cliente, y las páginas de `getFilteredOffers` encogían al filtrar después de paginar).
- `businesses` expone solo `id, name, type, image, rating, review_count` — nunca columnas sensibles (`owner_id`, `balance`, `commission_rate`).
- La ventana "por expirar" usa `now()` del servidor, no el reloj del device.

El repositorio móvil (`offersRepository`) llama a las funciones vía `supabase.rpc` con las firmas públicas sin cambios; `mapOfferDetail` reusa la fila jsonb tal cual. Quedan en PostgREST por ahora (sin geo): `getOfferById`, `getCategories`, `getCategoryStats`, `getPopularAreas`, `getAllActiveOffers` — follow-up natural si el volumen lo exige.

## SQL canónico

Las funciones viven en Supabase (migraciones no versionadas en el repo); este bloque es la referencia. Base (migración `postgis_geo_offers`):

```sql
create extension if not exists postgis with schema extensions;

alter table public.business_locations
  add column geog extensions.geography(point, 4326)
  generated always as (
    extensions.st_setsrid(
      extensions.st_makepoint(longitude::double precision, latitude::double precision), 4326
    )::extensions.geography
  ) stored;

create index business_locations_geog_idx on public.business_locations using gist (geog);
create index offers_active_idx on public.offers (created_at desc, pickup_end)
  where is_active and stock > 0;
```

Funciones (migraciones `rpc_active_offers_near` / `rpc_active_businesses_near`, ver dashboard de Supabase para el SQL completo vigente): ambas `language sql, stable, security invoker, set search_path = public, extensions`; predicados de actividad `is_active and stock > 0 and pickup_end > now()`; geo `st_dwithin(geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000.0)`; orden dinámico por `p_sort` con `case ... nulls last`.

## Consecuencias

- El cap de 1.000 filas deja de ser alcanzable en lectura de catálogo: la DB devuelve solo la página pedida.
- Un RPC por sección en vez de N fetches del set completo; payload proporcional a `p_limit`.
- Las páginas del explore dejan de encoger (`offset` aplica después de todos los filtros).
- DDL pendiente de versionar: si se incorpora `supabase/` con migraciones al repo, mover estas migraciones ahí (hoy solo existen en el proyecto).
- Drizzle mirror de la API: correr `bun run db:pull` en `apps/api` tras aplicar la migración.
