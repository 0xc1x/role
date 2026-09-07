import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import type {
  TipSchema,
  CreateTipSchema,
  UpdateTipSchema,
  ListTipsQuerySchema,
  PatchTipSchema,
  TipListResponseSchema,
  ViewTipSchema,
} from '../schemas/tip.schema';

/** Wire DTO for a tip resource (matches {@link TipSchema}). */
export type TipDto = z.infer<typeof TipSchema>;

export type CreateTipDto = z.infer<typeof CreateTipSchema>;
export type UpdateTipDto = z.infer<typeof UpdateTipSchema>;
export type ViewTipDto = z.infer<typeof ViewTipSchema>;
export type PatchTipDto = z.infer<typeof PatchTipSchema>;
export type TipListResponse = z.infer<typeof TipListResponseSchema>;
export type ListTipsQuery = z.infer<typeof ListTipsQuerySchema>;

/** Paginated list response for tips. */
export type TipPaginatedData = PaginatedData<TipDto>;
