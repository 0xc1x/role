-- Los segmentos pertenecen a una categoría de marketing, igual que las
-- campañas: solo se combinan si la categoría coincide.
alter table public.segments add column if not exists category text not null default 'announcements';