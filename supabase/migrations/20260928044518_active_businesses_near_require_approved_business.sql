CREATE OR REPLACE FUNCTION public.active_businesses_near(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_search text DEFAULT NULL::text, p_type text DEFAULT NULL::text, p_sort text DEFAULT 'deals'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, type text, image text, rating numeric, review_count integer, business_location_id uuid, address text, latitude numeric, longitude numeric, zone text, active_deals_count bigint, distance_km double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
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
    join businesses bv on bv.id = o.business_id
    where o.is_active
      and bv.is_active
      and exists (select 1 from public.business_moderation m
                  where m.business_id = bv.id and m.verification_status = 'approved')
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
  where (p_search is null or b.name ilike '%' || replace(replace(replace(p_search, '!', '!!'), '%', '!%'), '_', '!_') || '%' escape '!')
    and (p_type is null or b.type::text = lower(p_type))
  order by
    (case when p_sort = 'distance' and m.min_distance_km is not null then m.min_distance_km end) asc nulls last,
    m.deals_total desc,
    b.name asc,
    b.id
  limit greatest(p_limit, 1) offset greatest(p_offset, 0)
$function$;