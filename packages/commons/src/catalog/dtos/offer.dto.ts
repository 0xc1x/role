import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import type { ListOffersQuerySchema } from '../schemas/offer-query.schema';
import type {
  CreateOfferSchema,
  OfferListResponseSchema,
  OfferSchema,
  OfferWithBusinessSchema,
  PatchOfferSchema,
  UpdateOfferSchema,
  ViewOfferSchema,
} from '../schemas/offer.schema';

export type OfferDto = z.infer<typeof OfferSchema>;
export type CreateOfferDto = z.infer<typeof CreateOfferSchema>;
export type UpdateOfferDto = z.infer<typeof UpdateOfferSchema>;
export type ViewOfferDto = z.infer<typeof ViewOfferSchema>;
export type PatchOfferDto = z.infer<typeof PatchOfferSchema>;
export type OfferListResponse = z.infer<typeof OfferListResponseSchema>;
export type OfferPaginatedData = PaginatedData<OfferDto>;

export type ListOffersQuery = z.infer<typeof ListOffersQuerySchema>;

/** Oferta con embeds de negocio, ubicación y categorías (proyección PostgREST/API). */
export type OfferWithBusiness = z.infer<typeof OfferWithBusinessSchema>;
