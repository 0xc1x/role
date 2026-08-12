import type { z } from 'zod';
import type {
  CreateOrderEventSchema,
  OrderEventSchema,
} from '../schemas/order-event.schema';

export type OrderEventDto = z.infer<typeof OrderEventSchema>;
export type CreateOrderEventDto = z.infer<typeof CreateOrderEventSchema>;
