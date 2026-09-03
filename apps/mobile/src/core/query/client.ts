import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { analytics } from '@/core/analytics';
import { isAppError } from '@/core/error/app-error';

/**
 * Global React Query client.
 *
 * Server state (offers, orders, profiles, …) lives here so screens share
 * a single source of truth with automatic background refetch and
 * cache invalidation after mutations.
 *
 * Errores inesperados (kind=unknown) se reportan a Sentry (nativo+web).
 * Errores de negocio/validación no se envían para no hacer ruido.
 */
function shouldReportToSentry(error: unknown): boolean {
  if (isAppError(error)) {
    return error.kind === 'unknown' || error.kind === 'network';
  }
  // Error no clasificado -> reportar
  return true;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (shouldReportToSentry(error)) {
        analytics.trackError(error, {
          queryKey: query.queryKey,
          queryHash: query.queryHash,
        });
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (shouldReportToSentry(error)) {
        analytics.trackError(error, {
          mutationKey: mutation.options.mutationKey,
        });
      }
    },
  }),
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
