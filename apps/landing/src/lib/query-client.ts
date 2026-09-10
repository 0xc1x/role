import { QueryClient } from "@tanstack/react-query";

/** Fábrica única de QueryClient para SSR (router) e hidratación (__root). */
export function createAppQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1 },
		},
	});
}
