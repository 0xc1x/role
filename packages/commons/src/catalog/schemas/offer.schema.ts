import { z } from 'zod';
import {
  NonNegativeIntSchema,
  PositiveNumberSchema,
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';
import { PaginatedDataSchema } from '../../_common/schemas/api.schema';

export const OfferSchema = z.object({
  id: UuidSchema,
  business_id: UuidSchema,
  business_location_id: UuidSchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  image: z.string().nullable(),
  category_ids: z.array(UuidSchema),
  original_price: PositiveNumberSchema,
  discounted_price: PositiveNumberSchema,
  discount_percentage: z.number().nullable(),
  stock: NonNegativeIntSchema,
  initial_stock: NonNegativeIntSchema,
  pickup_start: TimestamptzSchema,
  pickup_end: TimestamptzSchema,
  is_active: z.boolean(),
  includes: z.string().nullable(),
  allergens: z.string().nullable(),
  rating: z.number(),
  review_count: z.number().int(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const ViewOfferSchema = OfferSchema.pick({
  id: true,
  business_id: true,
  business_location_id: true,
  title: true,
  description: true,
  image: true,
  category_ids: true,
  original_price: true,
  discounted_price: true,
  discount_percentage: true,
  stock: true,
  initial_stock: true,
  pickup_start: true,
  pickup_end: true,
  is_active: true,
  includes: true,
  allergens: true,
  rating: true,
  review_count: true,
});

const CreateOfferFieldsSchema = z.object({
  business_id: UuidSchema,
  business_location_id: UuidSchema,
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  category_ids: z.array(UuidSchema).min(1),
  original_price: PositiveNumberSchema,
  discounted_price: PositiveNumberSchema,
  stock: NonNegativeIntSchema.optional(),
  initial_stock: NonNegativeIntSchema.optional(),
  pickup_start: TimestamptzSchema,
  pickup_end: TimestamptzSchema,
  is_active: z.boolean().optional(),
  includes: z.string().nullable().optional(),
  allergens: z.string().nullable().optional(),
});

export const CreateOfferSchema = CreateOfferFieldsSchema.refine(
  (body) => body.discounted_price <= body.original_price,
  {
    message: 'discounted_price must be less than or equal to original_price',
    path: ['discounted_price'],
  },
).refine(
  (body) =>
    new Date(body.pickup_end).getTime() > new Date(body.pickup_start).getTime(),
  {
    message: 'pickup_end must be after pickup_start',
    path: ['pickup_end'],
  },
);

export const UpdateOfferSchema = CreateOfferFieldsSchema.partial()
  .omit({
    business_id: true,
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field is required',
  })
  .superRefine((body, ctx) => {
    if (
      body.discounted_price !== undefined &&
      body.original_price !== undefined &&
      body.discounted_price > body.original_price
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'discounted_price must be less than or equal to original_price',
        path: ['discounted_price'],
      });
    }
    if (
      body.pickup_start !== undefined &&
      body.pickup_end !== undefined &&
      new Date(body.pickup_end).getTime() <=
        new Date(body.pickup_start).getTime()
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'pickup_end must be after pickup_start',
        path: ['pickup_end'],
      });
    }
  });

export const PatchOfferSchema = UpdateOfferSchema;

export const OfferListResponseSchema = PaginatedDataSchema(OfferSchema);
