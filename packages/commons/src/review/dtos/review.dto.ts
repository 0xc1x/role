import type { z } from 'zod';
import type {
  CreateReviewRequestSchema,
  CreateReviewSchema,
  ReviewSchema,
  UpdateReviewSchema,
} from '../schemas/review.schema';

export type ReviewDto = z.infer<typeof ReviewSchema>;
export type CreateReviewDto = z.infer<typeof CreateReviewSchema>;
export type CreateReviewRequestDto = z.infer<typeof CreateReviewRequestSchema>;
export type UpdateReviewDto = z.infer<typeof UpdateReviewSchema>;
