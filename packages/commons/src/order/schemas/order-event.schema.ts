import { z } from "zod";
import {
	JsonObjectSchema,
	OrderStatusSchema,
	TimestamptzSchema,
	UuidSchema,
} from "../../_common/schemas/common";

export const OrderEventSchema = z.object({
	id: UuidSchema,
	order_id: UuidSchema,
	status: OrderStatusSchema,
	previous_status: OrderStatusSchema.nullable(),
	changed_by: UuidSchema.nullable(),
	reason: z.string().nullable(),
	metadata: JsonObjectSchema.nullable(),
	created_at: TimestamptzSchema,
});

export const CreateOrderEventSchema = z.object({
	order_id: UuidSchema,
	status: OrderStatusSchema,
	previous_status: OrderStatusSchema.nullable().optional(),
	changed_by: UuidSchema.nullable().optional(),
	reason: z.string().nullable().optional(),
	metadata: JsonObjectSchema.nullable().optional(),
});

/**
 * One transition of an order's timeline — the public projection of
 * `order_events`, and deliberately NOT {@link OrderEventSchema}.
 *
 * Two columns of the row are withheld, and the omission is the point of this
 * schema rather than a gap to be filled later:
 *
 * - `metadata`: internal machinery. It carries notification dedupe keys and
 *   source markers written by the notification handlers, so it is an
 *   implementation detail of the writers, not something a consumer renders.
 * - `changed_by`: a profile uuid. The order response already carries the
 *   customer, and the acting user is an internal audit fact, so exposing the raw
 *   uuid would add a user identifier with no meaning for the caller.
 *
 * The timeline answers "how did this order get to its current state", and these
 * four fields answer exactly that.
 */
export const OrderTimelineEventSchema = z.object({
	status: OrderStatusSchema,
	previous_status: OrderStatusSchema.nullable(),
	reason: z.string().nullable(),
	created_at: TimestamptzSchema,
});
