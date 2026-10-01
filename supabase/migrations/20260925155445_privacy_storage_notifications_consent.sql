-- Privacy, storage, notification delivery metadata, and public aggregate hardening.
begin;
drop policy if exists "Business can view business profiles" on public.profiles;
drop policy if exists "Businesses can view their order customers" on public.profiles;
create policy "Businesses can view their order customers" on public.profiles
for select to authenticated
using (exists (
  select 1 from public.orders o join public.businesses b on b.id=o.business_id
  where o.user_id=profiles.id and b.owner_id=(select auth.uid())
));
update storage.buckets set file_size_limit=5242880, allowed_mime_types=array['image/jpeg','image/png','image/webp']
where name in ('buisness_images','business_images','product_images','categories_images','images');
drop policy if exists "Authenticated users can update buisness images" on storage.objects;
drop policy if exists "Authenticated users can update business images" on storage.objects;
drop policy if exists "Authenticated users can update product images" on storage.objects;
drop policy if exists "Authenticated users can upload buisness images" on storage.objects;
drop policy if exists "Authenticated users can upload business images" on storage.objects;
drop policy if exists "Authenticated users can upload product images" on storage.objects;
drop policy if exists "Owners can upload product images" on storage.objects;
drop policy if exists "Owners can update product images" on storage.objects;
drop policy if exists "Owners can delete product images" on storage.objects;
drop policy if exists "Owners can upload buisness images" on storage.objects;
drop policy if exists "Owners can update buisness images" on storage.objects;
drop policy if exists "Owners can delete buisness images" on storage.objects;
drop policy if exists "Owners can upload business images" on storage.objects;
drop policy if exists "Owners can update business images" on storage.objects;
drop policy if exists "Owners can delete business images" on storage.objects;
create policy "Owners can upload product images" on storage.objects for insert to authenticated with check (bucket_id='product_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "Owners can update product images" on storage.objects for update to authenticated using (bucket_id='product_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text)) with check (bucket_id='product_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "Owners can delete product images" on storage.objects for delete to authenticated using (bucket_id='product_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "Owners can upload buisness images" on storage.objects for insert to authenticated with check (bucket_id='buisness_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "Owners can update buisness images" on storage.objects for update to authenticated using (bucket_id='buisness_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text)) with check (bucket_id='buisness_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "Owners can delete buisness images" on storage.objects for delete to authenticated using (bucket_id='buisness_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "Owners can upload business images" on storage.objects for insert to authenticated with check (bucket_id='business_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "Owners can update business images" on storage.objects for update to authenticated using (bucket_id='business_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text)) with check (bucket_id='business_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy "Owners can delete business images" on storage.objects for delete to authenticated using (bucket_id='business_images' and owner=(select auth.uid()) and (storage.foldername(name))[1]=(select auth.uid()::text));
create or replace function public.business_completed_orders_count(p_business_id uuid)
returns bigint language sql stable security definer set search_path='' as $$
  select count(*)::bigint from public.orders where business_id=p_business_id and status='completed'::public.order_status
$$;
revoke all on function public.business_completed_orders_count(uuid) from public;
grant execute on function public.business_completed_orders_count(uuid) to anon, authenticated, service_role;
comment on function public.business_completed_orders_count(uuid) is 'Returns only the completed-order aggregate for a public business profile; order rows remain RLS-protected.';
commit;