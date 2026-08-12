import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
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
