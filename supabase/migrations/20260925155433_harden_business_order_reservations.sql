-- Business approval, reservation idempotency, order numbering and event authority.
--
-- SAFETY: apply this migration only to a reviewed Supabase development branch.
-- Do not apply it directly to production. Exercise active_offers_near,
-- reserve_offer (including concurrent replay), order-number generation and every
-- order-status RPC before promotion.
--
-- Rollback warning: do not restore MAX+1 order numbers, client-side event
-- writes, broad business visibility, or the old duplicate-prone reserve path.
-- The historical order-event cleanup in this file is intentionally not reversed
-- by a simple rollback because the deleted rows are duplicate audit records.

begin;

-- Fail closed if legacy rows would prevent the composite relationship guard.
do $$
begin
  if exists (
    select 1
    from public.offers o
    join public.business_locations l on l.id = o.business_location_id
    where l.business_id <> o.business_id
  ) then
    raise exception
      'Cannot enforce offer/location ownership: mismatched legacy offers exist';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_locations'::regclass
      and conname = 'business_locations_id_business_id_key'
  ) then
    alter table public.business_locations
      add constraint business_locations_id_business_id_key
      unique (id, business_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.offers'::regclass
      and conname = 'offers_location_business_fkey'
  ) then
    alter table public.offers
      add constraint offers_location_business_fkey
      foreign key (business_location_id, business_id)
      references public.business_locations(id, business_id)
      on update restrict
      on delete restrict;
  end if;
end;
$$;

-- New offers are inactive by default. Approved businesses can still explicitly
-- activate them; the trigger below prevents activation while unapproved.
alter table public.offers
  alter column is_active set default false;

create or replace function public.enforce_offer_business_availability()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.businesses b
    where b.id = new.business_id
      and b.is_active = true
      and b.verification_status = 'approved'
  ) then
    new.is_active := false;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_offer_business_availability on public.offers;
create trigger enforce_offer_business_availability
before insert or update of business_id, business_location_id, is_active
on public.offers
for each row
execute function public.enforce_offer_business_availability();

-- A single sequence is shared by the Supabase RPC and the NestJS mirror. It is
-- initialized above the highest legacy folio for today before first use.
create sequence if not exists public.order_number_seq as bigint;

do $$
declare
  v_current bigint;
begin
  select coalesce(
    max(cast(substring(order_number from 14) as bigint)),
    0
  )
  into v_current
  from public.orders
  where order_number ~ '^FD-[0-9]{4}-[0-9]{4}-[0-9]+$'
    and order_number like 'FD-' || to_char(now(), 'YYYY-MMDD') || '-%';

  perform setval(
    'public.order_number_seq',
    greatest(v_current, 1),
    v_current > 0
  );
end;
$$;

create or replace function public.generate_order_number()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_next_seq bigint := nextval('public.order_number_seq');
begin
  return 'FD-' || to_char(now(), 'YYYY-MMDD') || '-' ||
    lpad(v_next_seq::text, 3, '0');
end;
$$;

-- Idempotency is scoped to the authenticated user. NULL keeps the old
-- three-argument RPC behavior for non-idempotent callers.
alter table public.orders
  add column if not exists idempotency_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_idempotency_key_length'
  ) then
    alter table public.orders
      add constraint orders_idempotency_key_length
      check (
        idempotency_key is null
        or length(idempotency_key) between 1 and 128
      );
  end if;
end;
$$;

create unique index if not exists orders_user_idempotency_key_unique
on public.orders(user_id, idempotency_key)
where idempotency_key is not null;

-- The database trigger is the sole order-event authority for inserts and status
-- updates. The RPC and API only mutate orders.
create or replace function public.on_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (
      order_id,
      status,
      previous_status,
      changed_by,
      reason,
      metadata
    )
    values (
      new.id,
      new.status,
      null,
      new.user_id,
      'Reserva creada',
      '{"source":"database"}'::jsonb
    );
  elsif old.status is distinct from new.status then
    insert into public.order_events (
      order_id,
      status,
      previous_status,
      changed_by,
      reason,
      metadata
    )
    values (
      new.id,
      new.status,
      old.status,
      coalesce(
        auth.uid(),
        nullif(current_setting('role.order_event_actor', true), '')::uuid
      ),
      case
        when new.status = 'cancelled' then 'Cancelado'
        when new.status = 'expired' then 'Pickup window ended'
        else null
      end,
      '{"source":"database"}'::jsonb
    );
  end if;

  return new;
end;
$$;

drop trigger if exists on_order_status_change on public.orders;
create trigger on_order_status_change
after insert or update
on public.orders
for each row
execute function public.on_order_status_change();

-- Remove historical rows written twice for the same transition, preserving the
-- earliest database-trigger event.
with ranked_events as (
  select
    id,
    row_number() over (
      partition by order_id, status, previous_status
      order by created_at, id
    ) as duplicate_rank
  from public.order_events
)
delete from public.order_events event
using ranked_events
where event.id = ranked_events.id
  and ranked_events.duplicate_rank > 1;

-- Only approved and active businesses may publish offers.
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
returns table(
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
  pickup_start timestamp with time zone,
  pickup_end timestamp with time zone,
  is_active boolean,
  includes text,
  allergens text,
  rating numeric,
  review_count integer,
  created_at timestamp with time zone,
  businesses jsonb,
  business_locations jsonb,
  offer_categories jsonb,
  distance_km double precision
)
language sql
stable
set search_path to 'public', 'extensions'
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
         else st_distance(
           l.geog,
           st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
         ) / 1000.0
    end as distance_km
  from offers o
  join business_locations l on l.id = o.business_location_id
  join businesses b on b.id = o.business_id
  where o.is_active
    and b.is_active
    and b.verification_status = 'approved'
    and o.stock > 0
    and o.pickup_end > now()
    and (
      p_lat is null or p_lng is null or p_radius_km is null
      or st_dwithin(
        l.geog,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        p_radius_km * 1000.0
      )
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
      or (
        o.pickup_end > now()
        and o.pickup_end < now() + make_interval(hours => p_expiring_within_hours)
      )
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
          then st_distance(
            l.geog,
            st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
          ) / 1000.0
     end) asc nulls last,
    (case when p_sort = 'pickup_end' then o.pickup_end end) asc nulls last,
    o.created_at desc,
    o.id
  limit greatest(p_limit, 1) offset greatest(p_offset, 0);
$$;

-- Replace the three-argument function with a compatible four-argument signature.
-- The last two parameters are optional, so existing named-argument callers keep
-- working while mobile can supply a replay key.
drop function if exists public.reserve_offer(uuid, uuid, uuid);
drop function if exists public.reserve_offer(uuid, uuid, uuid, text);

create function public.reserve_offer(
  p_user_id uuid,
  p_offer_id uuid,
  p_coupon_id uuid default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer record;
  v_existing_order record;
  v_order_id uuid;
  v_order_number text;
  v_pickup_code text;
  v_price numeric(10,2);
  v_original_price numeric(10,2);
  v_coupon record;
  v_discount numeric(10,2) := 0;
  v_commission_rate numeric(10,4);
  v_platform_fee numeric(12,2);
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    return jsonb_build_object(
      'success', false,
      'error', 'UNAUTHORIZED',
      'message', 'No puedes reservar en nombre de otro usuario'
    );
  end if;

  p_idempotency_key := nullif(btrim(p_idempotency_key), '');
  if p_idempotency_key is not null then
    if length(p_idempotency_key) > 128 then
      return jsonb_build_object(
        'success', false,
        'error', 'INVALID_IDEMPOTENCY_KEY',
        'message', 'La clave de idempotencia es demasiado larga'
      );
    end if;

    -- Serialize concurrent calls for the same user/key before reading replay
    -- state. The unique index remains the final database backstop.
    perform pg_advisory_xact_lock(
      hashtextextended(p_user_id::text || ':' || p_idempotency_key, 0)
    );

    select *
    into v_existing_order
    from public.orders
    where user_id = p_user_id
      and idempotency_key = p_idempotency_key;

    if found then
      if v_existing_order.offer_id <> p_offer_id
        or v_existing_order.coupon_id is distinct from p_coupon_id then
        return jsonb_build_object(
          'success', false,
          'error', 'IDEMPOTENCY_KEY_REUSED',
          'message', 'La clave de idempotencia ya fue usada para otra reserva'
        );
      end if;

      return jsonb_build_object(
        'success', true,
        'replayed', true,
        'order_id', v_existing_order.id,
        'order_number', v_existing_order.order_number,
        'pickup_code', v_existing_order.pickup_code,
        'price', v_existing_order.price,
        'original_price', v_existing_order.original_price,
        'discount', v_existing_order.original_price - v_existing_order.price,
        'platform_fee', v_existing_order.platform_fee,
        'net_amount', v_existing_order.net_amount,
        'status', v_existing_order.status
      );
    end if;
  end if;

  select o.*
  into v_offer
  from public.offers o
  join public.businesses b on b.id = o.business_id
  where o.id = p_offer_id
    and o.is_active = true
    and b.is_active = true
    and b.verification_status = 'approved'
  for update of o;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'OFFER_NOT_FOUND',
      'message', 'Oferta no encontrada o inactiva'
    );
  end if;

  if v_offer.stock <= 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'OFFER_OUT_OF_STOCK',
      'message', 'Oferta agotada'
    );
  end if;

  if now() > v_offer.pickup_end then
    return jsonb_build_object(
      'success', false,
      'error', 'OFFER_EXPIRED',
      'message', 'Ventana de pickup cerrada'
    );
  end if;

  if exists (
    select 1
    from public.orders
    where user_id = p_user_id
      and offer_id = p_offer_id
      and status in ('pending', 'confirmed', 'ready_for_pickup')
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'DUPLICATE_RESERVATION',
      'message', 'Ya tienes una reserva activa para esta oferta'
    );
  end if;

  select commission_rate
  into v_commission_rate
  from public.businesses
  where id = v_offer.business_id;

  v_price := v_offer.discounted_price;
  v_original_price := v_offer.original_price;

  if p_coupon_id is not null then
    select *
    into v_coupon
    from public.coupons
    where id = p_coupon_id
      and is_active = true
      and (expires_at is null or expires_at > now())
      and (business_id = v_offer.business_id or business_id is null)
    for update;

    if found then
      if v_coupon.max_uses is not null
        and v_coupon.used_count >= v_coupon.max_uses then
        return jsonb_build_object(
          'success', false,
          'error', 'COUPON_EXHAUSTED',
          'message', 'Cupon agotado'
        );
      end if;

      if v_coupon.min_order_amount > v_price then
        return jsonb_build_object(
          'success', false,
          'error', 'COUPON_MIN_NOT_MET',
          'message', 'Monto minimo no alcanzado para el cupon'
        );
      end if;

      if v_coupon.type = 'percentage' then
        v_discount := least(v_price * v_coupon.value / 100, v_price);
      else
        v_discount := least(v_coupon.value, v_price);
      end if;

      v_price := greatest(v_price - v_discount, 0);
      update public.coupons
      set used_count = used_count + 1
      where id = p_coupon_id;
    end if;
  end if;

  update public.offers
  set stock = stock - 1
  where id = p_offer_id
    and stock > 0;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'OFFER_OUT_OF_STOCK',
      'message', 'Oferta agotada (condicion de carrera)'
    );
  end if;

  v_platform_fee := round(v_price * coalesce(v_commission_rate, 0), 2);
  v_order_number := public.generate_order_number();
  v_pickup_code := public.generate_pickup_code();

  insert into public.orders (
    user_id,
    offer_id,
    business_id,
    order_number,
    idempotency_key,
    status,
    price,
    original_price,
    pickup_code,
    coupon_id,
    commission_rate,
    platform_fee,
    net_amount
  )
  values (
    p_user_id,
    p_offer_id,
    v_offer.business_id,
    v_order_number,
    p_idempotency_key,
    'pending',
    v_price,
    v_original_price,
    v_pickup_code,
    p_coupon_id,
    coalesce(v_commission_rate, 0),
    v_platform_fee,
    v_price - v_platform_fee
  )
  returning id into v_order_id;

  return jsonb_build_object(
    'success', true,
    'replayed', false,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'pickup_code', v_pickup_code,
    'price', v_price,
    'original_price', v_original_price,
    'discount', v_discount,
    'platform_fee', v_platform_fee,
    'net_amount', v_price - v_platform_fee,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.reserve_offer(uuid, uuid, uuid, text) from public;
grant execute on function public.reserve_offer(uuid, uuid, uuid, text)
to authenticated, service_role;
grant execute on function public.generate_order_number()
to authenticated, service_role;
grant execute on function public.active_offers_near(
  double precision,
  double precision,
  double precision,
  uuid,
  text,
  integer,
  numeric,
  text,
  integer,
  integer
)
to anon, authenticated, service_role;

comment on function public.reserve_offer(uuid, uuid, uuid, text) is
  'Creates an order for an active offer from an approved active business. A user-scoped idempotency key replays the existing order instead of consuming stock twice.';
comment on function public.generate_order_number() is
  'Generates daily order folios from the shared order_number_seq sequence.';
comment on function public.on_order_status_change() is
  'Sole authority for initial and status-transition order_events rows.';

commit;
