import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import type {
  CommissionSchema,
  ListCommissionsQuerySchema,
  UpdateCommissionSchema,
  CommissionListResponseSchema,
} from '../schemas/commission.schema';

/** Wire DTO for a commission resource (matches {@link CommissionSchema}). */
export type CommissionDto = z.infer<typeof CommissionSchema>;

export type UpdateCommissionDto = z.infer<typeof UpdateCommissionSchema>;
export type ListCommissionsQuery = z.infer<typeof ListCommissionsQuerySchema>;

/** Paginated list response for commissions. */
export type CommissionListResponse = z.infer<typeof CommissionListResponseSchema>;

/** Equivalent explicit form — prefer this for service return types. */
export type CommissionPaginatedData = PaginatedData<CommissionDto>;
