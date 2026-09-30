import type { z } from "zod";
import type { PaginatedData } from "../../_common/dtos/api.dto";
import type {
	CreateOrderEventSchema,
	OrderEventSchema,
	OrderTimelineEventSchema,
} from "../schemas/order-event.schema";

export type OrderEventDto = z.infer<typeof OrderEventSchema>;
export type CreateOrderEventDto = z.infer<typeof CreateOrderEventSchema>;

/**
 * Public timeline entry. Exposes neither `metadata` nor `changed_by` — see the
 * omission note on `OrderTimelineEventSchema`.
 */
export type OrderTimelineEventDto = z.infer<typeof OrderTimelineEventSchema>;

/** Paginated order timeline. */
export type OrderEventsPaginatedData = PaginatedData<OrderTimelineEventDto>;
