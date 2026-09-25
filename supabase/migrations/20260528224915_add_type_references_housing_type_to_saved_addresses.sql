ALTER TABLE public.saved_addresses
ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'home',
ADD COLUMN IF NOT EXISTS "references" text,
ADD COLUMN IF NOT EXISTS housing_type text;