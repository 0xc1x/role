create or replace function public.get_platform_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  users_count int;
  businesses_count int;
  meals_count int;
begin
  select count(*) into users_count from auth.users;
  select count(*) into businesses_count from public.businesses where is_active = true;
  select count(*) into meals_count from public.orders where status in ('completed','picked_up');
  return jsonb_build_object(
    'users', users_count,
    'businesses', businesses_count,
    'meals', meals_count
  );
end;
$$;

grant execute on function public.get_platform_stats() to anon, authenticated;