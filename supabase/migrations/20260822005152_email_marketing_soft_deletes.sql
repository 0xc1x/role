-- Soft deletes: los registros inactivos siguen visibles en el grid admin;
-- solo deleted_at IS NOT NULL los oculta.
alter table public.email_components add column if not exists deleted_at timestamptz;
alter table public.email_templates  add column if not exists deleted_at timestamptz;
alter table public.segments         add column if not exists deleted_at timestamptz;
alter table public.campaigns        add column if not exists deleted_at timestamptz;