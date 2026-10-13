alter table public.orders add column business_location_id uuid;

alter table public.orders
  add constraint orders_location_business_fkey
    foreign key (business_location_id, business_id)
    references public.business_locations (id, business_id) on delete restrict;

update public.orders o set business_location_id = f.business_location_id
  from public.offers f where f.id = o.offer_id;

-- Falla ruidosa si algún pedido quedó sin sucursal en vez de dejar NOT NULL de lado.
do $$
declare missing integer;
begin
  select count(*) into missing from public.orders where business_location_id is null;
  if missing > 0 then
    raise exception 'orders sin business_location_id: %', missing;
  end if;
end $$;

alter table public.orders alter column business_location_id set not null;

-- Deriva la columna en cada insert, included el de reserve_offer.
create or replace function public.set_order_business_location()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  select f.business_location_id into new.business_location_id
  from public.offers f where f.id = new.offer_id;
  if new.business_location_id is null then
    raise exception 'la oferta % no existe, no se puede derivar la sucursal', new.offer_id;
  end if;
  return new;
end $fn$;

create trigger trg_set_order_business_location
  before insert on public.orders
  for each row execute function public.set_order_business_location();