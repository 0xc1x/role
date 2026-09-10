import { z } from 'zod';
import { RatingSchema, TimestamptzSchema, UuidSchema } from '../../_common/schemas/common';

export const ReviewSchema = z.object({
  id: UuidSchema,
  user_id: UuidSchema,
  business_id: UuidSchema,
  order_id: UuidSchema.nullable(),
  rating: RatingSchema.nullable(),
  comment: z.string().nullable(),
  product_rating: RatingSchema.nullable(),
  business_rating: RatingSchema.nullable(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateReviewSchema = z.object({
  user_id: UuidSchema,
  business_id: UuidSchema,
  order_id: UuidSchema.nullable().optional(),
  rating: RatingSchema.nullable().optional(),
  comment: z.string().nullable().optional(),
  product_rating: RatingSchema.nullable().optional(),
  business_rating: RatingSchema.nullable().optional(),
});

export const UpdateReviewSchema = z
  .object({
    rating: RatingSchema.nullable(),
    comment: z.string().nullable(),
    product_rating: RatingSchema.nullable(),
    business_rating: RatingSchema.nullable(),
  })
  .partial();

/**
 * Request del endpoint `POST /reviews` (API): user_id y business_id los
 * deriva el server a partir de la orden, el cliente nunca los envía.
 */
export const CreateReviewRequestSchema = z.object({
  order_id: UuidSchema,
  comment: z.string().max(2000).nullable().optional(),
  product_rating: RatingSchema.nullable().optional(),
  business_rating: RatingSchema.nullable().optional(),
});
