import type { z } from 'zod';
import type { PaginatedData } from '../../_common/dtos/api.dto';
import type {
  CommissionListResponseSchema,
  CommissionSchema,
  ListCommissionsQuerySchema,
  UpdateCommissionSchema,
} from '../schemas/commission.schema';

/** Wire DTO for a commission resource (matches {@link CommissionSchema}). */
export type CommissionDto = z.infer<typeof CommissionSchema>;

export type UpdateCommissionDto = z.infer<typeof UpdateCommissionSchema>;
export type ListCommissionsQuery = z.infer<typeof ListCommissionsQuerySchema>;
export type CommissionListResponse = z.infer<typeof CommissionListResponseSchema>;

/** Paginated list response for commissions. */
export type CommissionPaginatedData = PaginatedData<CommissionDto>;
