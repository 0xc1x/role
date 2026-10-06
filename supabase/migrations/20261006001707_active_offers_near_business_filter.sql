-- Filtro por negocio en `active_offers_near`.
--
-- El perfil publico de un negocio necesita mostrar sus ofertas, y este RPC es la
-- unica puerta que conserva la definicion completa de "oferta activa": oferta y
-- negocio activos, `business_is_approved`, stock y `pickup_end`. Un select
-- directo por `business_id` si puede leer las ofertas —la policy "Anyone can view
-- active offers" lo permite—, pero esa comprobacion vive en el servidor y el
-- cliente no tiene forma de replicarla: `business_moderation` no le es legible.
--
-- `p_business_id` va AL FINAL y con `default null`. Al final para no mover los
-- diez argumentos anteriores de lugar, y con default para que toda llamada
-- existente siga siendo valida sin tocar un solo cliente.
--
-- POR QUE HAY UN `drop` Y UN `grant`: `create or replace` no alcanza, porque la
-- identidad de una funcion son sus tipos de argumento —agregar un parametro crea
-- una SOBRECARGA en vez de reemplazar—, y dos sobrecargas con los mismos nombres
-- de parametro hacen que PostgREST rechace la llamada por ambiguedad. El `drop`
-- se lleva el ACL con el, asi que los `grant` explicitos van detras: sin ellos el
-- RPC quedaria ejecutable solo por `postgres` y toda la app, incluido el anon,
-- recibiria un 401 en cada llamada.

drop function if exists public.active_offers_near(p_lat double precision, p_lng double precision, p_radius_km double precision, p_category_id uuid, p_sort text, p_expiring_within_hours integer, p_max_price numeric, p_search text, p_limit integer, p_offset integer);

create or replace function public.active_offers_near(p_lat double precision default null::double precision, p_lng double precision default null::double precision, p_radius_km double precision default null::double precision, p_category_id uuid default null::uuid, p_sort text default 'created_at'::text, p_expiring_within_hours integer default null::integer, p_max_price numeric default null::numeric, p_search text default null::text, p_limit integer default 20, p_offset integer default 0, p_business_id uuid default null::uuid)
 returns table(id uuid, business_id uuid, business_location_id uuid, title text, description text, image text, original_price numeric, discounted_price numeric, stock integer, initial_stock integer, pickup_start timestamp with time zone, pickup_end timestamp with time zone, is_active boolean, includes text, allergens text, rating numeric, review_count integer, created_at timestamp with time zone, businesses jsonb, business_locations jsonb, offer_categories jsonb, distance_km double precision)
 language sql
 stable
 set search_path to 'public','extensions'
as $function$
  select o.id,o.business_id,o.business_location_id,o.title,o.description,o.image,
    o.original_price,o.discounted_price,o.stock,o.initial_stock,o.pickup_start,o.pickup_end,o.is_active,
    o.includes,o.allergens,o.rating,o.review_count,o.created_at,
    jsonb_build_object('id',b.id,'name',b.name,'type',b.type::text,'image',b.image,'rating',b.rating,'review_count',b.review_count),
    jsonb_build_object('id',l.id,'name',l.name,'address',l.address,'latitude',l.latitude,'longitude',l.longitude,'zone',l.zone),
    coalesce((select jsonb_agg(jsonb_build_object('categories',jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug,'emoji',c.emoji,'image_url',c.image_url,'active',c.active)) order by c.name)
      from offer_categories oc join categories c on c.id=oc.category_id where oc.offer_id=o.id),'[]'::jsonb),
    case when p_lat is null or p_lng is null then null else st_distance(l.geog,st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography)/1000.0 end
  from offers o join business_locations l on l.id=o.business_location_id join businesses b on b.id=o.business_id
  where o.is_active and b.is_active and public.business_is_approved(b.id) and o.stock>0 and o.pickup_end>now()
    and (p_business_id is null or o.business_id = p_business_id)
    and (p_lat is null or p_lng is null or p_radius_km is null or st_dwithin(l.geog,st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography,p_radius_km*1000.0))
    and (p_category_id is null or exists(select 1 from offer_categories oc where oc.offer_id=o.id and oc.category_id=p_category_id))
    and (p_expiring_within_hours is null or (o.pickup_end>now() and o.pickup_end<now()+make_interval(hours=>p_expiring_within_hours)))
    and (p_max_price is null or o.discounted_price<=p_max_price)
    and (p_search is null or o.title ilike '%' || replace(replace(replace(p_search, '!', '!!'), '%', '!%'), '_', '!_') || '%' escape '!' or o.description ilike '%' || replace(replace(replace(p_search, '!', '!!'), '%', '!%'), '_', '!_') || '%' escape '!' or b.name ilike '%' || replace(replace(replace(p_search, '!', '!!'), '%', '!%'), '_', '!_') || '%' escape '!')
  order by (case when p_sort='distance' and p_lat is not null and p_lng is not null then st_distance(l.geog,st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography)/1000.0 end) asc nulls last,
    (case when p_sort='pickup_end' then o.pickup_end end) asc nulls last,o.created_at desc,o.id
  limit greatest(p_limit,1) offset greatest(p_offset,0);
$function$;

grant execute on function public.active_offers_near(p_lat double precision, p_lng double precision, p_radius_km double precision, p_category_id uuid, p_sort text, p_expiring_within_hours integer, p_max_price numeric, p_search text, p_limit integer, p_offset integer, p_business_id uuid) to anon, authenticated, service_role;
