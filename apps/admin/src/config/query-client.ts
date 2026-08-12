import { QueryClient } from "@tanstack/react-query";
import { ApiClientError } from "@/lib/api/errors";

export function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30_000,
				retry: (count, error) => {
					if (error instanceof ApiClientError) {
						if (
							error.status === 401 ||
							error.status === 403 ||
							error.status === 404
						) {
							return false;
						}
					}
					return count < 1;
				},
				refetchOnWindowFocus: false,
			},
		},
	});
}

let client: QueryClient | undefined;

export function getQueryClient() {
	if (!client) client = createQueryClient();
	return client;
}
