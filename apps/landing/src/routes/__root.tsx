import type { QueryClient as QC } from "@tanstack/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";

export interface RouterContext {
	queryClient: QC;
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
			{
				property: "og:title",
				content: "Rolé — Comida deliciosa. Mitad de precio.",
			},
			{
				property: "og:description",
				content:
					"Rescata comida deliciosa a precio increíble. Conectamos comercios con excedente y personas que quieren comer bien por menos.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:image", content: "/og.png" },
			{ name: "twitter:card", content: "summary_large_image" },
			{
				name: "twitter:title",
				content: "Rolé — Comida deliciosa. Mitad de precio.",
			},
			{
				name: "twitter:description",
				content: "Rescata comida deliciosa a precio increíble.",
			},
			{ name: "twitter:image", content: "/og.png" },
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
				href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700&display=swap",
			},
			{ rel: "icon", type: "image/svg+xml", href: "/icon.svg" },
		],
	}),
	notFoundComponent: () => (
		<div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-role-background px-6 text-center">
			<div
				aria-hidden
				className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-role-primary/15 blur-3xl"
			/>
			<p className="font-heading text-7xl font-extrabold tracking-tight text-role-primary">
				404
			</p>
			<h1 className="mt-4 font-heading text-2xl font-bold">
				Esta oferta se agotó
			</h1>
			<p className="mt-2 max-w-sm text-role-muted-foreground">
				La página que buscas no existe o se quedó sin stock. Mejor volvamos a la
				raza.
			</p>
			<Link
				to="/"
				className="mt-8 rounded-full bg-role-primary px-7 py-3 font-semibold text-white transition-all duration-200 hover:bg-role-primary-hover hover:shadow-glow active:scale-[0.98]"
			>
				Volver al inicio
			</Link>
		</div>
	),
	component: RootComponent,
});

function getQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: 1 },
		},
	});
}

function RootComponent() {
	const queryClient = getQueryClient();

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						(entry.target as HTMLElement).dataset.revealed = "true";
						observer.unobserve(entry.target);
					}
				}
			},
			{ threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
		);

		const observeAll = () => {
			document
				.querySelectorAll(".reveal:not([data-revealed='true'])")
				.forEach((el) => {
					observer.observe(el);
				});
		};

		observeAll();

		const mutation = new MutationObserver(observeAll);
		mutation.observe(document.body, { childList: true, subtree: true });

		return () => {
			observer.disconnect();
			mutation.disconnect();
		};
	}, []);

	return (
		<QueryClientProvider client={queryClient}>
			<a
				href="#main"
				className="sr-only z-[70] rounded-full bg-role-primary px-5 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
			>
				Saltar al contenido
			</a>
			<HeadContent />
			<Outlet />
			<Scripts />
		</QueryClientProvider>
	);
}
