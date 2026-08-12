import type { z } from 'zod';
import type {
  CreateReviewSchema,
  ReviewSchema,
  UpdateReviewSchema,
} from '../schemas/review.schema';

export type ReviewDto = z.infer<typeof ReviewSchema>;
export type CreateReviewDto = z.infer<typeof CreateReviewSchema>;
export type UpdateReviewDto = z.infer<typeof UpdateReviewSchema>;
