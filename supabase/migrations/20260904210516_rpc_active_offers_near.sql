-- Ofertas activas compuestas (offer + business + location + categories + distance)
-- filtradas y paginadas en la base de datos. Reemplaza el patrón "traer todo y
-- filtrar con haversine en el cliente" (limitado por el cap de 1000 filas de la API).
--
-- p_lat/p_lng/p_radius_km null (cualquiera) => sin filtro geo (fallback global).
-- p_sort: 'created_at' (default) | 'distance' | 'pickup_end'.
create or replace function public.active_offers_near(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km double precision default null,
  p_category_id uuid default null,
  p_sort text default 'created_at',
  p_expiring_within_hours integer default null,
  p_max_price numeric default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  business_id uuid,
  business_location_id uuid,
  title text,
  description text,
  image text,
  original_price numeric,
  discounted_price numeric,
  stock integer,
  initial_stock integer,
  pickup_start timestamptz,
  pickup_end timestamptz,
  is_active boolean,
  includes text,
  allergens text,
  rating numeric,
  review_count integer,
  created_at timestamptz,
  businesses jsonb,
  business_locations jsonb,
  offer_categories jsonb,
  distance_km double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    o.id, o.business_id, o.business_location_id, o.title, o.description, o.image,
    o.original_price, o.discounted_price, o.stock, o.initial_stock,
    o.pickup_start, o.pickup_end, o.is_active, o.includes, o.allergens,
    o.rating, o.review_count, o.created_at,
    jsonb_build_object(
      'id', b.id, 'name', b.name, 'type', b.type::text, 'image', b.image,
      'rating', b.rating, 'review_count', b.review_count
    ) as businesses,
    jsonb_build_object(
      'id', l.id, 'name', l.name, 'address', l.address,
      'latitude', l.latitude, 'longitude', l.longitude, 'zone', l.zone
    ) as business_locations,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'categories', jsonb_build_object(
              'id', c.id, 'name', c.name, 'slug', c.slug, 'emoji', c.emoji,
              'image_url', c.image_url, 'active', c.active
            )
          )
          order by c.name
        )
        from offer_categories oc
        join categories c on c.id = oc.category_id
        where oc.offer_id = o.id
      ),
      '[]'::jsonb
    ) as offer_categories,
    case when p_lat is null or p_lng is null then null
         else st_distance(l.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0
    end as distance_km
  from offers o
  join business_locations l on l.id = o.business_location_id
  join businesses b on b.id = o.business_id
  where o.is_active
    and o.stock > 0
    and o.pickup_end > now()
    and (
      p_lat is null or p_lng is null or p_radius_km is null
      or st_dwithin(l.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000.0)
    )
    and (
      p_category_id is null
      or exists (
        select 1 from offer_categories oc
        where oc.offer_id = o.id and oc.category_id = p_category_id
      )
    )
    and (
      p_expiring_within_hours is null
      or (o.pickup_end > now() and o.pickup_end < now() + make_interval(hours => p_expiring_within_hours))
    )
    and (p_max_price is null or o.discounted_price <= p_max_price)
    and (
      p_search is null
      or o.title ilike '%' || p_search || '%'
      or o.description ilike '%' || p_search || '%'
      or b.name ilike '%' || p_search || '%'
    )
  order by
    (case when p_sort = 'distance' and p_lat is not null and p_lng is not null
          then st_distance(l.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0
     end) asc nulls last,
    (case when p_sort = 'pickup_end' then o.pickup_end end) asc nulls last,
    o.created_at desc,
    o.id
  limit greatest(p_limit, 1) offset greatest(p_offset, 0)
$$;

comment on function public.active_offers_near is 'Ofertas activas con filtro geoespacial (ST_DWithin + GIST), categoría, precio, búsqueda y ventana de expiración. Filtra y pagina server-side; devuelve la misma forma embebida que el select PostgREST del móvil + distance_km.';

-- Resumen de negocios con ofertas activas: datos de la ubicación más cercana,
-- total de ofertas activas dentro del radio y distancia. Reemplaza el dedupe
-- client-side de getAllBusinesses/getNearbyBusinesses.
-- p_sort: 'deals' (default, más ofertas primero) | 'distance'.
create or replace function public.active_businesses_near(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km double precision default null,
  p_search text default null,
  p_type text default null,
  p_sort text default 'deals',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  type text,
  image text,
  rating numeric,
  review_count integer,
  business_location_id uuid,
  address text,
  latitude numeric,
  longitude numeric,
  zone text,
  active_deals_count bigint,
  distance_km double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with matching_offers as (
    select
      o.business_id,
      count(*) as deals_total,
      min(
        case when p_lat is null or p_lng is null then null
             else st_distance(l.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0
        end
      ) as min_distance_km
    from offers o
    join business_locations l on l.id = o.business_location_id
    where o.is_active
      and o.stock > 0
      and o.pickup_end > now()
      and (
        p_lat is null or p_lng is null or p_radius_km is null
        or st_dwithin(l.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000.0)
      )
    group by o.business_id
  )
  select
    b.id, b.name, b.type::text, b.image, b.rating, b.review_count,
    loc.id as business_location_id,
    loc.address, loc.latitude, loc.longitude, loc.zone,
    m.deals_total as active_deals_count,
    case when p_lat is null or p_lng is null then null
         else st_distance(loc.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0
    end as distance_km
  from matching_offers m
  join businesses b on b.id = m.business_id
  join lateral (
    select l2.id, l2.address, l2.latitude, l2.longitude, l2.zone, l2.geog
    from offers o2
    join business_locations l2 on l2.id = o2.business_location_id
    where o2.business_id = m.business_id
      and o2.is_active and o2.stock > 0 and o2.pickup_end > now()
    order by
      (case when p_lat is null or p_lng is null then null
            else st_distance(l2.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) / 1000.0
       end) asc nulls last,
      l2.id
    limit 1
  ) loc on true
  where (p_search is null or b.name ilike '%' || p_search || '%')
    and (p_type is null or b.type::text = lower(p_type))
  order by
    (case when p_sort = 'distance' and m.min_distance_km is not null then m.min_distance_km end) asc nulls last,
    m.deals_total desc,
    b.name asc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0)
$$;

comment on function public.active_businesses_near is 'Negocios con ofertas activas deduplicados server-side: ubicación más cercana al punto, total de ofertas activas en radio y distancia. p_sort: deals|distance.';