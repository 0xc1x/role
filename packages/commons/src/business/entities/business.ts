import type { BusinessType } from '../enums/business-type';

/** Row shape for `public.businesses` */
export interface Business {
  id: string;
  owner_id: string;
  name: string;
  type: BusinessType;
  slug: string;
  image: string | null;
  cover_image: string | null;
  rating: number | null;
  review_count: number | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  commission_rate: number | null;
  balance: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
