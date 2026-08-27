import type { z } from 'zod';
import type {
  CreateOrderRequestSchema,
  ListBusinessOrdersQuerySchema,
  ListOrdersQuerySchema,
  UpdateOrderStatusSchema,
  ValidatePickupCodeSchema,
} from '../schemas/order-query.schema';

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type UpdateOrderStatusRequest = z.infer<typeof UpdateOrderStatusSchema>;
export type ValidatePickupCodeRequest = z.infer<typeof ValidatePickupCodeSchema>;
export type ListOrdersQuery = z.infer<typeof ListOrdersQuerySchema>;
export type ListBusinessOrdersQuery = z.infer<
  typeof ListBusinessOrdersQuerySchema
>;
