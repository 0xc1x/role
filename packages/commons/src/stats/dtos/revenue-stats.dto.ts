import type { z } from "zod";
import type {
	RevenueStatsQuerySchema,
	RevenueStatsSchema,
} from "../schemas/revenue-stats.schema";

/** Money report for a period, as returned by the API (admin only). */
export type RevenueStats = z.infer<typeof RevenueStatsSchema>;

/** Query del reporte de dinero: rango de días calendario, ambos opcionales. */
export type RevenueStatsQuery = z.infer<typeof RevenueStatsQuerySchema>;
