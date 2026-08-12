import { z } from 'zod';
import { TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';

export const FavoriteSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  offer_id: UuidSchema,
  created_at: TimestamptzSchema,
});

export const CreateFavoriteSchema = z.object({
  user_id: UuidSchema,
  offer_id: UuidSchema,
});
