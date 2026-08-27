import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import type { ListOffersQuerySchema } from '../schemas/offer-query.schema';
import type {
  ViewOfferSchema,
  CreateOfferSchema,
  OfferSchema,
  UpdateOfferSchema,
  PatchOfferSchema,
  OfferListResponseSchema,
} from '../schemas/offer.schema';

export type OfferDto = z.infer<typeof OfferSchema>;
export type CreateOfferDto = z.infer<typeof CreateOfferSchema>;
export type UpdateOfferDto = z.infer<typeof UpdateOfferSchema>;
export type ViewOfferDto = z.infer<typeof ViewOfferSchema>;
export type PatchOfferDto = z.infer<typeof PatchOfferSchema>;
export type OfferListResponse = z.infer<typeof OfferListResponseSchema>;
export type OfferPaginatedData = PaginatedData<OfferDto>;

export type ListOffersQuery = z.infer<typeof ListOffersQuerySchema>;

export interface OfferWithBusiness {
  id: string;
  business_id: string;
  business_location_id: string;
  title: string;
  description: string | null;
  image: string | null;
  category_ids: string[];
  categories: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
  original_price: number;
  discounted_price: number;
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
  business: {
    id: string;
    name: string;
    slug: string;
    image: string | null;
    rating: number | null;
  };
  location: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
    zone: string | null;
  };
}
