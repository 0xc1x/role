import type { z } from "zod";
import type { PaginatedData } from "../../_common/dtos/api.dto";
import type {
	AdminOrderListItemSchema,
	CreateOrderSchema,
	OrderSchema,
	UpdateOrderSchema,
} from "../schemas/order.schema";
import type { ReserveOfferResultSchema } from "../schemas/reserve-offer.schema";

export type OrderDto = z.infer<typeof OrderSchema>;
export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderDto = z.infer<typeof UpdateOrderSchema>;
export type ReserveOfferResultDto = z.infer<typeof ReserveOfferResultSchema>;

/** Fila del listado de back office; el mapper decide qué se expone. */
export type AdminOrderListItemDto = z.infer<typeof AdminOrderListItemSchema>;
export type AdminOrderPaginatedData = PaginatedData<AdminOrderListItemDto>;
