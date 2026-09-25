-- Fudi categories RLS + data quality
-- Backs the DB-driven categories model (categories + offer_categories junction).

-- 1. RLS policies on public.categories
drop policy if exists "Anyone can view active categories" on public.categories;
create policy "Anyone can view active categories"
  on public.categories for select
  to anon, authenticated
  using (active = true);

drop policy if exists "Admins can manage categories" on public.categories;
create policy "Admins can manage categories"
  on public.categories for all
  to authenticated
  using (auth_helpers.my_role() = 'admin')
  with check (auth_helpers.my_role() = 'admin');

-- 2. RLS policies on public.offer_categories
drop policy if exists "Anyone can view offer categories" on public.offer_categories;
create policy "Anyone can view offer categories"
  on public.offer_categories for select
  to anon, authenticated
  using (true);

drop policy if exists "Owners can insert offer categories" on public.offer_categories;
create policy "Owners can insert offer categories"
  on public.offer_categories for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.offers o
      join public.businesses b on b.id = o.business_id
      where o.id = offer_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "Owners can delete offer categories" on public.offer_categories;
create policy "Owners can delete offer categories"
  on public.offer_categories for delete
  to authenticated
  using (
    exists (
      select 1
      from public.offers o
      join public.businesses b on b.id = o.business_id
      where o.id = offer_id
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage offer categories" on public.offer_categories;
create policy "Admins can manage offer categories"
  on public.offer_categories for all
  to authenticated
  using (auth_helpers.my_role() = 'admin')
  with check (auth_helpers.my_role() = 'admin');

-- 3. Index on the non-PK column of the junction
create index if not exists idx_offer_categories_category_id
  on public.offer_categories (category_id);

-- 4. Soft-delete junk/test categories
update public.categories
set active = false, deleted_at = now(), updated_at = now()
where slug in ('dsa', 'prueba-cat', 'wssd');

-- 5. Backfill emoji/image_url for categories created without them
update public.categories set emoji = '☕', image_url = 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&q=80', updated_at = now() where slug = 'cafe';
update public.categories set emoji = '🍕', image_url = 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&q=80', updated_at = now() where slug = 'italiana';
update public.categories set emoji = '🍣', image_url = 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=400&q=80', updated_at = now() where slug = 'japonesa';
update public.categories set emoji = '🎁', image_url = 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&q=80', updated_at = now() where slug = 'sorpresa';

-- 6. Insert the categories still missing from the catalog
insert into public.categories (name, slug, emoji, image_url, active)
values
  ('Restaurante', 'restaurante', '🍽️', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&q=80', true),
  ('Mercado', 'mercado', '🛒', 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80', true),
  ('Pastelería', 'pasteleria', '🍰', 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&q=80', true),
  ('Asiática', 'asiatica', '🍜', 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=80', true),
  ('Saludable', 'saludable', '🥗', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80', true),
  ('Comida Preparada', 'comida-preparada', '🍱', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80', true),
  ('Frutas y Verduras', 'frutas-y-verduras', '🥬', 'https://images.unsplash.com/photo-1610348725531-843dff14722a?w=400&q=80', true),
  ('Lácteos', 'lacteos', '🥛', 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&q=80', true),
  ('Carnes', 'carnes', '🥩', 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?w=400&q=80', true),
  ('Snacks', 'snacks', '🍿', 'https://images.unsplash.com/photo-1578849278619-e73505e9610f?w=400&q=80', true),
  ('Otro', 'otro', '📦', 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=400&q=80', true)
on conflict (slug) do nothing;