import type { z } from 'zod';
import type { TipSchema } from '../schemas/tip.schema';

/**
 * Row shape for `public.tips` — derivado del schema Zod (SSOT).
 * Timestamps are ISO-8601 strings on the wire (same as TipDto).
 */
export type Tip = z.infer<typeof TipSchema>;
