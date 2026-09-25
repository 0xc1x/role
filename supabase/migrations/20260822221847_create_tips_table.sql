create table public.tips (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz
);

alter table public.tips enable row level security;

create policy "Anyone can view active tips"
  on public.tips for select
  to anon, authenticated
  using (active and deleted_at is null);

create policy "Admins can manage tips"
  on public.tips for all
  to authenticated
  using ((select auth_helpers.my_role()) = 'admin'::app_role)
  with check ((select auth_helpers.my_role()) = 'admin'::app_role);

create or replace function public.get_random_tip()
returns public.tips
language sql
stable
security invoker
set search_path = ''
as $$
  select * from public.tips
  where active and deleted_at is null
  order by random()
  limit 1;
$$;

grant execute on function public.get_random_tip() to anon, authenticated;

insert into public.tips (content) values
  ('¿Sabías que rescatando un paquete sorpresa evitas la emisión de 2.5kg de CO2?'),
  ('Rolé conecta excedentes de comida con personas que quieren ahorrar y ayudar al planeta.'),
  ('Revisa siempre el horario de recogida antes de realizar tu compra.');