import type { z } from 'zod';
import type {
  CreateFavoriteSchema,
  FavoriteSchema,
} from '../schemas/favorite.schema';

export type FavoriteDto = z.infer<typeof FavoriteSchema>;
export type CreateFavoriteDto = z.infer<typeof CreateFavoriteSchema>;
