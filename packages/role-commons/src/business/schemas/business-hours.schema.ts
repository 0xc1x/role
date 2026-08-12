import { z } from 'zod';
import {
  DayOfWeekSchema,
  TimeSchema,
  TimestamptzSchema,
  UuidSchema,
} from '../../_common/schemas/common';

export const BusinessHoursSchema = z.object({
  id: UuidSchema,
  business_id: UuidSchema,
  day: DayOfWeekSchema,
  open_time: TimeSchema,
  close_time: TimeSchema,
  is_closed: z.boolean(),
  created_at: TimestamptzSchema,
  updated_at: TimestamptzSchema,
});

export const CreateBusinessHoursSchema = z.object({
  business_id: UuidSchema,
  day: DayOfWeekSchema,
  open_time: TimeSchema,
  close_time: TimeSchema,
  is_closed: z.boolean().optional(),
});

export const UpdateBusinessHoursSchema = CreateBusinessHoursSchema.partial().omit(
  { business_id: true },
);
