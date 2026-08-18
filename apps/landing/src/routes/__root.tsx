import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";

import { getQueryClient } from "@/lib/query-client";
import appCss from "../styles.css?url";

export interface RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Rolé — Rescata comida deliciosa a precio increíble" },
			{
				name: "description",
				content:
					"Rolé conecta comercios locales con excedente de comida con personas que quieren comer bien por menos. Menos desperdicio, más comunidad.",
			},
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com",
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap",
			},
			{ rel: "icon", type: "image/svg+xml", href: "/icon.svg" },
		],
	}),
	notFoundComponent: () => (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4">
			<h1 className="text-4xl font-bold">404</h1>
			<p className="text-role-muted-foreground">Página no encontrada</p>
			<Link to="/" className="text-role-primary hover:underline">
				Volver al inicio
			</Link>
		</div>
	),
	component: RootComponent,
});

function RootComponent() {
	const queryClient = getQueryClient();
	return (
		<QueryClientProvider client={queryClient}>
			<HeadContent />
			<Outlet />
			<Scripts />
		</QueryClientProvider>
	);
}
