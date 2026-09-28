import type { z } from "zod";
import type {
	BusinessCompletedOrdersSchema,
	BusinessDailyStatSchema,
	BusinessSalesStatsQuerySchema,
	BusinessSalesStatsResponseSchema,
	BusinessSalesStatsSchema,
	BusinessTopProductSchema,
} from "../schemas/business-stats.schema";

export type BusinessCompletedOrdersDto = z.infer<
	typeof BusinessCompletedOrdersSchema
>;
export type BusinessTopProductDto = z.infer<typeof BusinessTopProductSchema>;
export type BusinessDailyStatDto = z.infer<typeof BusinessDailyStatSchema>;
export type BusinessSalesStatsDto = z.infer<typeof BusinessSalesStatsSchema>;
export type BusinessSalesStatsQuery = z.infer<
	typeof BusinessSalesStatsQuerySchema
>;
export type BusinessSalesStatsResponseDto = z.infer<
	typeof BusinessSalesStatsResponseSchema
>;
