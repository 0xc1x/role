import type { z } from 'zod';
import type {
  CreateOrderSchema,
  OrderSchema,
  UpdateOrderSchema,
} from '../schemas/order.schema';
import type { ReserveOfferResultSchema } from '../schemas/reserve-offer.schema';

export type OrderDto = z.infer<typeof OrderSchema>;
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderDto = z.infer<typeof UpdateOrderSchema>;
export type ReserveOfferResultDto = z.infer<typeof ReserveOfferResultSchema>;
