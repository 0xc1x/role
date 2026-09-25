-- Sistema de emails de marketing: componentes, plantillas, segmentos,
-- campañas y registro de envíos (cola = email_sends.status='queued').

-- ─── Enums ─────────────────────────────────────────────────────────────
create type email_component_type as enum ('header', 'footer');
create type segment_type as enum ('static', 'dynamic');
create type campaign_status as enum (
  'draft', 'scheduled', 'sending', 'sent', 'cancelled', 'failed'
);
create type email_send_status as enum (
  'queued', 'sent', 'delivered', 'opened', 'clicked',
  'bounced', 'complained', 'failed'
);

-- ─── Componentes reutilizables (header / footer) ──────────────────────
create table public.email_components (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  type         email_component_type not null,
  html_content text not null,
  is_active    boolean not null default true,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_email_components_type_active on public.email_components(type, is_active);

-- ─── Plantillas de cuerpo ──────────────────────────────────────────────
create table public.email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subject     text not null,
  body_html   text not null,
  header_id   uuid references public.email_components(id) on delete set null,
  footer_id   uuid references public.email_components(id) on delete set null,
  variables   jsonb default '[]'::jsonb,
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Preferencias de marketing (self-service vía RLS) ─────────────────
create table public.marketing_preferences (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  is_subscribed   boolean not null default true,
  categories      text[] not null default array['announcements']::text[],
  unsubscribed_at timestamptz,
  source          text,
  updated_at      timestamptz not null default now()
);

-- ─── Segmentos ─────────────────────────────────────────────────────────
create table public.segments (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  type            segment_type not null default 'dynamic',
  filters         jsonb,
  is_active       boolean not null default true,
  estimated_count integer default 0,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Solo para segmentos estáticos.
create table public.segment_users (
  segment_id uuid not null references public.segments(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (segment_id, user_id)
);
create index idx_segment_users_user on public.segment_users(user_id);

-- ─── Campañas ──────────────────────────────────────────────────────────
create table public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  template_id      uuid references public.email_templates(id) on delete set null,

  -- Overrides opcionales sobre la plantilla
  subject_override text,
  body_override    text,

  -- Categoría de marketing que debe aceptar el destinatario
  category         text not null default 'announcements',

  -- Destinatarios
  segment_ids      uuid[] default '{}'::uuid[],
  include_user_ids uuid[] default '{}'::uuid[],
  exclude_user_ids uuid[] default '{}'::uuid[],

  status           campaign_status not null default 'draft',
  scheduled_at     timestamptz,
  sent_at          timestamptz,

  -- Estadísticas rápidas
  total_recipients integer default 0,
  total_sent       integer default 0,
  total_delivered  integer default 0,
  total_opened     integer default 0,
  total_clicked    integer default 0,
  total_bounced    integer default 0,

  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_campaigns_status on public.campaigns(status);
create index idx_campaigns_scheduled on public.campaigns(scheduled_at) where status = 'scheduled';

-- ─── Registro individual de envíos (es la cola) ───────────────────────
create table public.email_sends (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete set null,
  email          text not null,

  resend_id      text,
  status         email_send_status not null default 'queued',

  sent_at        timestamptz,
  delivered_at   timestamptz,
  opened_at      timestamptz,
  clicked_at     timestamptz,
  bounced_at     timestamptz,
  error_message  text,

  variables_used jsonb,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_email_sends_campaign on public.email_sends(campaign_id);
create index idx_email_sends_user on public.email_sends(user_id);
create index idx_email_sends_resend_id on public.email_sends(resend_id);
create index idx_email_sends_status on public.email_sends(status);
-- Cola del cron: lotes de queued por campaña.
create index idx_email_sends_queued on public.email_sends(campaign_id, created_at)
  where status = 'queued';

-- ─── RLS ───────────────────────────────────────────────────────────────
alter table public.email_components enable row level security;
alter table public.email_templates enable row level security;
alter table public.segments enable row level security;
alter table public.segment_users enable row level security;
alter table public.campaigns enable row level security;
alter table public.email_sends enable row level security;
alter table public.marketing_preferences enable row level security;

-- Gestión: solo admins.
create policy "Admins manage email components"
  on public.email_components for all to authenticated
  using ((select auth_helpers.my_role()) = 'admin')
  with check ((select auth_helpers.my_role()) = 'admin');
create policy "Admins manage email templates"
  on public.email_templates for all to authenticated
  using ((select auth_helpers.my_role()) = 'admin')
  with check ((select auth_helpers.my_role()) = 'admin');
create policy "Admins manage segments"
  on public.segments for all to authenticated
  using ((select auth_helpers.my_role()) = 'admin')
  with check ((select auth_helpers.my_role()) = 'admin');
create policy "Admins manage segment users"
  on public.segment_users for all to authenticated
  using ((select auth_helpers.my_role()) = 'admin')
  with check ((select auth_helpers.my_role()) = 'admin');
create policy "Admins manage campaigns"
  on public.campaigns for all to authenticated
  using ((select auth_helpers.my_role()) = 'admin')
  with check ((select auth_helpers.my_role()) = 'admin');
create policy "Admins view email sends"
  on public.email_sends for select to authenticated
  using ((select auth_helpers.my_role()) = 'admin');

-- Preferencias: self-service (el móvil consume Supabase directo).
create policy "Users can view own marketing preferences"
  on public.marketing_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users can insert own marketing preferences"
  on public.marketing_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users can update own marketing preferences"
  on public.marketing_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─── Seed: preferencias por defecto para perfiles existentes ──────────
insert into public.marketing_preferences (user_id, is_subscribed, categories, source)
select p.id, true, array['announcements']::text[], 'seed'
from public.profiles p
on conflict (user_id) do nothing;