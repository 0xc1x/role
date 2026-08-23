import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import type {
  TipSchema,
  CreateTipSchema,
  UpdateTipSchema,
  ViewTipSchema,
  PatchTipSchema,
  ListTipsQuerySchema,
  TipListResponseSchema,
} from '../schemas/tip.schema';

/** Wire DTO for a tip resource (matches {@link TipSchema}). */
export type TipDto = z.infer<typeof TipSchema>;

export type CreateTipDto = z.infer<typeof CreateTipSchema>;
export type UpdateTipDto = z.infer<typeof UpdateTipSchema>;
export type ViewTipDto = z.infer<typeof ViewTipSchema>;
export type PatchTipDto = z.infer<typeof PatchTipSchema>;
export type ListTipsQuery = z.infer<typeof ListTipsQuerySchema>;

/** Paginated list response for tips. */
export type TipListResponse = z.infer<typeof TipListResponseSchema>;

/** Equivalent explicit form — prefer this for service return types. */
export type TipPaginatedData = PaginatedData<TipDto>;
