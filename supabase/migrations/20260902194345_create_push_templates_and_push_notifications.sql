-- Plantillas de push reutilizables (gestionadas desde admin vía API BFF)
create table public.push_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Historial de envíos manuales de push desde admin
create table public.push_notifications (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.push_templates(id),
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  type text not null default 'announcement',
  segment_ids uuid[] not null default '{}'::uuid[],
  include_user_ids uuid[] not null default '{}'::uuid[],
  exclude_user_ids uuid[] not null default '{}'::uuid[],
  total_targeted integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'sent' check (status in ('sent','partial','failed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index push_notifications_created_at_idx on public.push_notifications (created_at desc);

alter table public.push_templates enable row level security;
alter table public.push_notifications enable row level security;

create policy "Admins manage push templates"
  on public.push_templates
  for all
  to authenticated
  using ((select auth_helpers.my_role()) = 'admin'::app_role)
  with check ((select auth_helpers.my_role()) = 'admin'::app_role);

create policy "Admins view push notifications"
  on public.push_notifications
  for select
  to authenticated
  using ((select auth_helpers.my_role()) = 'admin'::app_role);