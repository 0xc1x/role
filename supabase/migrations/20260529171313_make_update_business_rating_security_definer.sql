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
      SELECT COALESCE(AVG(rating), 0)
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

-- Backfill existing businesses with their actual review stats
UPDATE public.businesses b
SET
  rating = COALESCE((SELECT AVG(r.rating) FROM public.reviews r WHERE r.business_id = b.id), 0),
  review_count = COALESCE((SELECT COUNT(*) FROM public.reviews r WHERE r.business_id = b.id), 0);