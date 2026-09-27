import type { RevenueStatsQuery } from "@0xc1x/role-commons";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { statsApi } from "../api/stats.api";
import { statsKeys } from "./stats.keys";

export const platformStatsOptions = () =>
	queryOptions({
		queryKey: statsKeys.platform(),
		queryFn: () => statsApi.platform(),
		staleTime: 60_000,
	});

/**
 * Reporte de dinero. `staleTime` corto a propósito: son KPIs de un período que
 * el operador mira para decidir, y una cifra de hace cinco minutos es otra
 * cifra. El período forma parte de la key, así que cambiar de ventana no pisa
 * el reporte anterior.
 */
export const revenueStatsOptions = (query?: RevenueStatsQuery) =>
	queryOptions({
		queryKey: statsKeys.revenue(query),
		queryFn: () => statsApi.revenue(query),
		staleTime: 30_000,
	});

export function usePlatformStats() {
	return useQuery(platformStatsOptions());
}

export function useRevenueStats(query?: RevenueStatsQuery) {
	return useQuery(revenueStatsOptions(query));
}
