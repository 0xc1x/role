-- 1. Add rating + review_count to offers
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS rating numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count integer NOT NULL DEFAULT 0;

-- 2. Replace the single trigger with two focused functions

-- 2a. Function to update businesses.rating from AVG(business_rating)
CREATE OR REPLACE FUNCTION public.update_business_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_business_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_business_id := OLD.business_id;
  ELSE
    v_business_id := NEW.business_id;
  END IF;

  UPDATE public.businesses
  SET
    rating = (
      SELECT COALESCE(AVG(business_rating), 0)
      FROM public.reviews
      WHERE business_id = v_business_id
    ),
    review_count = (
      SELECT COUNT(*)
      FROM public.reviews
      WHERE business_id = v_business_id
    )
  WHERE id = v_business_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 2b. Function to update offers.rating from AVG(product_rating)
-- Requires joining through orders to get offer_id
CREATE OR REPLACE FUNCTION public.update_offer_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_offer_id UUID;
BEGIN
  -- Determine the offer_id via the order
  IF TG_OP = 'DELETE' THEN
    SELECT offer_id INTO v_offer_id
    FROM public.orders WHERE id = OLD.order_id;
  ELSE
    SELECT offer_id INTO v_offer_id
    FROM public.orders WHERE id = NEW.order_id;
  END IF;

  IF v_offer_id IS NOT NULL THEN
    UPDATE public.offers
    SET
      rating = (
        SELECT COALESCE(AVG(r.product_rating), 0)
        FROM public.reviews r
        JOIN public.orders o ON o.id = r.order_id
        WHERE o.offer_id = v_offer_id
      ),
      review_count = (
        SELECT COUNT(*)
        FROM public.reviews r
        JOIN public.orders o ON o.id = r.order_id
        WHERE o.offer_id = v_offer_id
      )
    WHERE id = v_offer_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3. Drop old trigger and create new ones
DROP TRIGGER IF EXISTS on_review_change ON public.reviews;

CREATE TRIGGER on_review_change
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_business_rating();

CREATE TRIGGER on_review_offer_change
  AFTER INSERT OR UPDATE OR DELETE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_offer_rating();

-- 4. Backfill: compute offer ratings from existing reviews
UPDATE public.offers o
SET
  rating = COALESCE((
    SELECT AVG(r.product_rating)
    FROM public.reviews r
    JOIN public.orders ord ON ord.id = r.order_id
    WHERE ord.offer_id = o.id
  ), 0),
  review_count = COALESCE((
    SELECT COUNT(*)
    FROM public.reviews r
    JOIN public.orders ord ON ord.id = r.order_id
    WHERE ord.offer_id = o.id
  ), 0);

-- 5. Backfill: recompute business ratings using business_rating column
UPDATE public.businesses b
SET
  rating = COALESCE((
    SELECT AVG(r.business_rating)
    FROM public.reviews r
    WHERE r.business_id = b.id
  ), 0),
  review_count = COALESCE((
    SELECT COUNT(*)
    FROM public.reviews r
    WHERE r.business_id = b.id
  ), 0);