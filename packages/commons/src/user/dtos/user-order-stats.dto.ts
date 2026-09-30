import type { z } from "zod";
import type {
	UserOrderStatsResponseSchema,
	UserOrderStatsSchema,
} from "../schemas/user-order-stats.schema";

export type UserOrderStatsDto = z.infer<typeof UserOrderStatsSchema>;
export type UserOrderStatsResponseDto = z.infer<
	typeof UserOrderStatsResponseSchema
>;
