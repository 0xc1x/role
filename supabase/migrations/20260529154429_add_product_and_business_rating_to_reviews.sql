ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS product_rating integer,
  ADD COLUMN IF NOT EXISTS business_rating integer;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_product_rating_check
  CHECK (product_rating IS NULL OR (product_rating >= 1 AND product_rating <= 5));

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_business_rating_check
  CHECK (business_rating IS NULL OR (business_rating >= 1 AND business_rating <= 5));

COMMENT ON COLUMN public.reviews.product_rating IS 'Rating given to the product (1-5). NULL for legacy rows.';
COMMENT ON COLUMN public.reviews.business_rating IS 'Rating given to the business/service (1-5). NULL for legacy rows.';