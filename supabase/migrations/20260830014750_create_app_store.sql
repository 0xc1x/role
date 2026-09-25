create type store_entry_status as enum ('PENDIENTE','PROCESADO','ERROR');

create table app_store (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  key text,
  value jsonb not null,
  status store_entry_status not null default 'PENDIENTE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index app_store_namespace_idx on app_store(namespace);
create index app_store_status_idx on app_store(status);
create index app_store_created_at_idx on app_store(created_at);