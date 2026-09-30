CREATE OR REPLACE FUNCTION public.popular_zones(p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_radius_km double precision DEFAULT NULL::double precision, p_limit integer DEFAULT 5)
 RETURNS TABLE(zone text, deals bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    l.zone,
    count(*)::bigint as deals
  from offers o
  join business_locations l on l.id = o.business_location_id
  join businesses b on b.id = o.business_id
  where o.is_active
    and b.is_active
    and exists (select 1 from public.business_moderation m
                where m.business_id = b.id and m.verification_status = 'approved')
    and o.stock > 0
    and o.pickup_end > now()
    and l.zone is not null
    and l.zone <> ''
    and (
      p_lat is null or p_lng is null or p_radius_km is null
      or st_dwithin(l.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_km * 1000.0)
    )
  group by l.zone
  order by deals desc, l.zone
  limit greatest(p_limit, 1)
$function$;

CREATE OR REPLACE FUNCTION public.active_offer_category_counts()
 RETURNS TABLE(id uuid, name text, slug text, emoji text, image_url text, active boolean, active_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    c.id, c.name, c.slug, c.emoji, c.image_url, c.active,
    coalesce(cnt.active_count, 0)::bigint as active_count
  from categories c
  left join (
    select oc.category_id, count(*) as active_count
    from offers o
    join offer_categories oc on oc.offer_id = o.id
    join businesses b on b.id = o.business_id
    where o.is_active and o.stock > 0 and o.pickup_end > now()
      and b.is_active
      and exists (select 1 from public.business_moderation m
                  where m.business_id = b.id and m.verification_status = 'approved')
    group by oc.category_id
  ) cnt on cnt.category_id = c.id
  where c.active
  order by c.name
$function$;
