import type { z } from 'zod';
import type { CategorySchema } from '../schemas/category.schema';

/**
 * Row shape for `public.categories` — derivado del schema Zod (SSOT).
 * Timestamps are ISO-8601 strings on the wire (same as CategoryDto).
 */
export type Category = z.infer<typeof CategorySchema>;
