import type { z } from "zod";
import type {
	CreateOrderRequestSchema,
	ListAdminOrdersQuerySchema,
	ListBusinessOrdersQuerySchema,
	ListOrderEventsQuerySchema,
	ListOrdersQuerySchema,
	UpdateOrderStatusSchema,
	ValidatePickupCodeSchema,
} from "../schemas/order-query.schema";

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;
export type UpdateOrderStatusRequest = z.infer<typeof UpdateOrderStatusSchema>;
export type ValidatePickupCodeRequest = z.infer<
	typeof ValidatePickupCodeSchema
>;
export type ListOrdersQuery = z.infer<typeof ListOrdersQuerySchema>;
export type ListBusinessOrdersQuery = z.infer<
	typeof ListBusinessOrdersQuerySchema
>;
export type ListAdminOrdersQuery = z.infer<typeof ListAdminOrdersQuerySchema>;
export type ListOrderEventsQuery = z.infer<typeof ListOrderEventsQuerySchema>;
