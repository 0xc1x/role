/** Row shape for `public.offers` */
export interface Offer {
  id: string;
  business_id: string;
  business_location_id: string;
  title: string;
  description: string | null;
  image: string | null;
  category_ids: string[];
  original_price: number;
  discounted_price: number;
  /** Generated column: percentage discount */
  discount_percentage: number | null;
  stock: number;
  initial_stock: number;
  pickup_start: string;
  pickup_end: string;
  is_active: boolean;
  includes: string | null;
  allergens: string | null;
  rating: number;
  review_count: number;
  created_at: string;
  updated_at: string;
}
