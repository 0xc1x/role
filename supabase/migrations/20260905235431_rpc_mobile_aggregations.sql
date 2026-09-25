-- Agregaciones server-side para el móvil (reemplazan conteos/sumas en JS
-- sobre sets completos). Mismo patrón de ADR-0010: SECURITY INVOKER (RLS del
-- caller aplica) + search_path fijado.

-- Conteo de ofertas activas por categoría (categorías activas con count 0 incluidas).
create or replace function public.active_offer_category_counts()
returns table (
  id uuid,
  name text,
  slug text,
  emoji text,
  image_url text,
  active boolean,
  active_count bigint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id, c.name, c.slug, c.emoji, c.image_url, c.active,
    coalesce(cnt.active_count, 0)::bigint as active_count
  from categories c
  left join (
    select oc.category_id, count(*) as active_count
    from offers o
    join offer_categories oc on oc.offer_id = o.id
    where o.is_active and o.stock > 0 and o.pickup_end > now()
    group by oc.category_id
  ) cnt on cnt.category_id = c.id
  where c.active
  order by c.name
$$;

comment on function public.active_offer_category_counts is 'Categorías activas + ofertas activas (is_active, stock>0, vigentes) por categoría. Reemplaza el conteo client-side de getCategoryStats.';

-- Top zonas por ofertas activas, opcionalmente dentro de un radio del punto.
create or replace function public.popular_zones(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km double precision default null,
  p_limit integer default 5
)
returns table (
  zone text,
  deals bigint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    l.zone,
    count(*)::bigint as deals
  from offers o
  join business_locations l on l.id = o.business_location_id
  where o.is_active
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
$$;

comment on function public.popular_zones is 'Zonas (business_locations.zone) con más ofertas activas; sin punto de referencia devuelve el top global. Reemplaza getPopularAreas (traía 5000 filas + haversine en cliente).';

-- Stats de rescate del usuario: total de pedidos no cancelados y ahorro acumulado.
create or replace function public.user_order_stats(p_user_id uuid)
returns table (
  orders_count bigint,
  total_saved numeric
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    count(*)::bigint as orders_count,
    coalesce(sum(o.original_price - o.price), 0)::numeric as total_saved
  from orders o
  where o.user_id = p_user_id
    and o.status <> 'cancelled'
$$;

comment on function public.user_order_stats is 'Conteo + ahorro (original_price - price) del usuario en una agregación. Reemplaza getUserStats (traía todo el historial para sumar en JS).';

-- Conteo de órdenes completadas del negocio (totalRescued del perfil público).
create or replace function public.business_completed_orders_count(p_business_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select count(*)::bigint
  from orders o
  where o.business_id = p_business_id
    and o.status = 'completed'
$$;

comment on function public.business_completed_orders_count is 'Total de órdenes completadas del negocio. Reemplaza traer todos los ids para .length en cliente.';

-- Stats de ventas del negocio para un período: revenue, conteo, top 5 productos
-- (por unidades vendidas) y serie diaria (día UTC) para que el cliente re-arme
-- buckets semanales/mensuales con su lógica de etiquetas.
create or replace function public.business_sales_stats(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  orders_count bigint,
  revenue numeric,
  top_products jsonb,
  daily jsonb
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with period_orders as (
    select
      o.id, o.price, o.created_at,
      coalesce(offer.title, 'Desconocido') as title
    from orders o
    left join offers offer on offer.id = o.offer_id
    where o.business_id = p_business_id
      and o.status = 'completed'
      and o.created_at >= p_from
      and o.created_at <= p_to
  )
  select
    (select count(*) from period_orders)::bigint as orders_count,
    (select coalesce(sum(price), 0)::numeric from period_orders) as revenue,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('name', t.title, 'sold', t.sold, 'revenue', t.revenue)
          order by t.sold desc, t.first_seen asc
        ),
        '[]'::jsonb
      )
      from (
        select title, count(*) as sold, sum(price)::numeric as revenue, min(created_at) as first_seen
        from period_orders
        group by title
        order by sold desc, first_seen asc
        limit 5
      ) t
    ) as top_products,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'orders', d.orders, 'revenue', d.revenue)
          order by d.day
        ),
        '[]'::jsonb
      )
      from (
        select (created_at at time zone 'UTC')::date as day, count(*) as orders, sum(price)::numeric as revenue
        from period_orders
        group by day
        order by day
      ) d
    ) as daily
$$;

comment on function public.business_sales_stats is 'Agregación de ventas completadas por período (from..to inclusivo). daily agrupa por día UTC; el cliente mapea etiquetas/buckets. Reemplaza fetchCompletedOrders + agregación en JS.';