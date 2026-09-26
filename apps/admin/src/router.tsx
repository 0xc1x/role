import "zod/compile";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { getQueryClient } from "@/config/query-client";
import { setSessionExpiredHandler } from "@/lib/api/session-expiry";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const queryClient = getQueryClient();
	const router = createTanStackRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
	});
	// El cliente HTTP no puede navegar (ciclo de imports): avisa y el router
	// decide. `replace` para que "atrás" desde el login no devuelva a una ruta
	// que ya exigía sesión.
	setSessionExpiredHandler(({ from }) => {
		void router.navigate({
			to: "/login",
			search: { from, reason: "expired" },
			replace: true,
		});
	});
	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
