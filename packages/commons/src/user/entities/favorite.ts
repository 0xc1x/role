import type { z } from 'zod';
import type { FavoriteSchema } from '../schemas/favorite.schema';

/** Row shape for `public.favorites` — derivado del schema Zod (SSOT). */
export type Favorite = z.infer<typeof FavoriteSchema>;
