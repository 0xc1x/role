-- Fudi locations refactor: zone support, offers→locations FK, remove address from businesses
-- Rationale: businesses = identity (name, type, images).
--            business_locations = SOLE source of truth for addresses, coords, zones.
--            offers = reference the specific branch via business_location_id.

-- 1. Add zone and is_headquarter to business_locations
alter table public.business_locations
  add column zone text,
  add column is_headquarter boolean not null default false;

-- 2. Add FK from offers to business_locations
alter table public.offers
  add column business_location_id uuid references public.business_locations(id);

-- 3. Data migration: create missing business_locations for businesses without any
insert into public.business_locations (business_id, name, address, phone, latitude, longitude, is_headquarter)
  select
    b.id,
    'Matriz',
    b.address,
    b.phone,
    b.latitude,
    b.longitude,
    true
  from public.businesses b
  where not exists (
    select 1 from public.business_locations bl where bl.business_id = b.id
  );

-- 4. Mark first location as headquarter where not already set
with first_loc as (
  select distinct on (business_id) id, business_id
  from public.business_locations
  order by business_id, created_at
)
update public.business_locations bl
  set is_headquarter = true
  from first_loc
  where bl.id = first_loc.id and bl.is_headquarter = false;

-- 5. Assign existing offers to the headquarter location of their business
update public.offers o
  set business_location_id = bl.id
  from public.business_locations bl
  where bl.business_id = o.business_id
    and bl.is_headquarter = true
    and o.business_location_id is null;

-- 6. Make business_location_id NOT NULL now that all data is migrated
alter table public.offers alter column business_location_id set not null;

-- 7. Drop location index on businesses and remove address/lat/lng columns
drop index if exists public.idx_businesses_location;
alter table public.businesses
  drop column address,
  drop column latitude,
  drop column longitude;

-- 8. Add index on business_locations for zone queries
create index idx_business_locations_zone on public.business_locations (zone)
  where zone is not null and is_active = true;

-- 9. Index on offers for location-based queries
create index idx_offers_business_location on public.offers (business_location_id)
  where is_active = true;