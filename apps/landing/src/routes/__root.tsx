import type { QueryClient as QC } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CookieBanner } from "@/components/cookie-banner";
import { createAppQueryClient } from "@/lib/query-client";
import { absoluteUrl } from "@/lib/seo";
import appCss from "../styles.css?url";

export interface RouterContext {
	queryClient: QC;
}

const ORGANIZATION_JSON_LD = {
	"@context": "https://schema.org",
	"@type": "Organization",
	name: "Rolé",
	url: absoluteUrl("/"),
	logo: absoluteUrl("/icon.svg"),
	description:
		"Marketplace de comida excedente: rescata comida de comercios locales a mejor precio y reduce el desperdicio.",
};

export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => {
		const ogImage = absoluteUrl("/og.png") ?? "/og.png";
		return {
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				{ name: "theme-color", content: "#121212" },
				{ property: "og:locale", content: "es_EC" },
				{ title: "Rolé — Rescata comida deliciosa a precio increíble" },
				{
					name: "description",
					content:
						"Rolé conecta comercios locales con excedente de comida con personas que quieren comer bien por menos. Menos desperdicio, más comunidad.",
				},
				{ property: "og:type", content: "website" },
				{ property: "og:site_name", content: "Rolé" },
				{
					property: "og:title",
					content: "Rolé — Comida deliciosa. Mitad de precio.",
				},
				{
					property: "og:description",
					content:
						"Rescata comida deliciosa a precio increíble. Conectamos comercios con excedente y personas que quieren comer bien por menos.",
				},
				{ property: "og:image", content: ogImage },
				{ name: "twitter:card", content: "summary_large_image" },
				{
					name: "twitter:title",
					content: "Rolé — Comida deliciosa. Mitad de precio.",
				},
				{
					name: "twitter:description",
					content: "Rescata comida deliciosa a precio increíble.",
				},
				{ name: "twitter:image", content: ogImage },
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
					href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
				},
				{ rel: "icon", type: "image/svg+xml", href: "/icon.svg" },
			],
			scripts: [
				{
					type: "application/ld+json",
					children: JSON.stringify(ORGANIZATION_JSON_LD),
				},
			],
		};
	},
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
				className="mt-8 rounded-full bg-role-primary px-7 py-3 font-semibold text-white transition-[background-color,box-shadow,transform] duration-200 hover:bg-role-primary-hover hover:shadow-glow active:scale-[0.98]"
			>
				Volver al inicio
			</Link>
		</div>
	),
	component: RootComponent,
});

function RootComponent() {
	// Un solo QueryClient por montaje: el prefetch SSR del router se reutiliza.
	const [queryClient] = useState(() => createAppQueryClient());

	// react-doctor-disable-next-line react-doctor/effect-needs-cleanup -- cleanup below disconnects both IntersectionObserver and MutationObserver
	useEffect(() => {
		document.documentElement.classList.add("js");
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
		<html lang="es">
			<head>
				<HeadContent />
			</head>
			<body>
				<QueryClientProvider client={queryClient}>
					<a
						href="#main"
						className="sr-only z-[70] rounded-full bg-role-primary px-5 py-2 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
					>
						Saltar al contenido
					</a>
					<Outlet />
					<CookieBanner />
					<Scripts />
				</QueryClientProvider>
			</body>
		</html>
	);
}
