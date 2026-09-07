import { queryOptions, useQuery } from "@tanstack/react-query";
import { statsApi } from "../api/stats.api";
import { statsKeys } from "./stats.keys";

export const platformStatsOptions = () =>
	queryOptions({
		queryKey: statsKeys.platform(),
		queryFn: () => statsApi.platform(),
		staleTime: 60_000,
	});

export function usePlatformStats() {
	return useQuery(platformStatsOptions());
}
