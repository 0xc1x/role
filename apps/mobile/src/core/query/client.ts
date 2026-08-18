import { QueryClient } from '@tanstack/react-query';

/**
 * Global React Query client.
 *
 * Server state (offers, orders, profiles, …) lives here so screens share
 * a single source of truth with automatic background refetch and
 * cache invalidation after mutations.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
