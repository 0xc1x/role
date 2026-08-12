import type { z } from 'zod';
import type {
  CreatePayoutSchema,
  PayoutSchema,
  UpdatePayoutSchema,
} from '../schemas/payout.schema';

export type PayoutDto = z.infer<typeof PayoutSchema>;
export type CreatePayoutDto = z.infer<typeof CreatePayoutSchema>;
export type UpdatePayoutDto = z.infer<typeof UpdatePayoutSchema>;
