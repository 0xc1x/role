-- Consultas geoespaciales para ofertas/negocios (PostGIS + RPC).
-- PostGIS en schema extensions (oculto de la API pública), columna geog
-- generada desde lat/lng existentes (sin migración de datos).
create extension if not exists postgis with schema extensions;

alter table public.business_locations
  add column geog extensions.geography(point, 4326)
  generated always as (
    extensions.st_setsrid(
      extensions.st_makepoint(longitude::double precision, latitude::double precision),
      4326
    )::extensions.geography
  ) stored;

create index business_locations_geog_idx
  on public.business_locations using gist (geog);

-- Set activo que leen todas las queries del móvil y la API.
create index offers_active_idx
  on public.offers (created_at desc, pickup_end)
  where is_active and stock > 0;