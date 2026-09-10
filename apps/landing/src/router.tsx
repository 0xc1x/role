import "zod/compile";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { createAppQueryClient } from "@/lib/query-client";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const queryClient = createAppQueryClient();
	return createTanStackRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
