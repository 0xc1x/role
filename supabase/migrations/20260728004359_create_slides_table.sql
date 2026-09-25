create table public.slides (
    id uuid primary key default gen_random_uuid(),
    title text not null check (char_length(title) between 1 and 120),
    caption text not null check (char_length(caption) between 1 and 255),
    badge_text text check (char_length(badge_text) <= 30),
    cta_label text not null check (char_length(cta_label) between 1 and 50),
    redirect_url text not null,
    image_url text not null,
    text_color text check (text_color ~ '^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$'),
    button_color text check (button_color ~ '^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$'),
    type text not null check (type in ('ad', 'sponsor', 'tip', 'info')),
    priority int not null default 0 check (priority between 0 and 10),
    active boolean not null default true,
    start_at timestamptz,
    end_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz,
    deleted_at timestamptz,

    constraint slides_dates_check check (end_at is null or start_at is null or end_at >= start_at)
);

create index idx_slides_deleted_at on public.slides (deleted_at);
create index idx_slides_type on public.slides (type);
create index idx_slides_active on public.slides (active);
