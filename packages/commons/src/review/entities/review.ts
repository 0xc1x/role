/** Row shape for `public.reviews` */
export interface Review {
  id: string;
  user_id: string;
  business_id: string;
  order_id: string | null;
  /** Legacy overall rating (1–5). Prefer product/business ratings. */
  rating: number | null;
  comment: string | null;
  product_rating: number | null;
  business_rating: number | null;
  created_at: string;
  updated_at: string;
}
