import type { z } from 'zod';
import type { CommissionSchema } from '../schemas/commission.schema';

/**
 * Row shape for a business commission — derivado del schema Zod (SSOT).
 * `commission_rate` is a fraction (0.1 = 10%). Timestamps are ISO-8601 strings.
 */
export type Commission = z.infer<typeof CommissionSchema>;
