import type { z } from 'zod';
import type {
  CreateOrderSchema,
  OrderSchema,
  UpdateOrderSchema,
} from '../schemas/order.schema';

export type OrderDto = z.infer<typeof OrderSchema>;
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderDto = z.infer<typeof UpdateOrderSchema>;
