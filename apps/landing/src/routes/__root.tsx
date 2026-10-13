import { DISCOUNT_MAX_CLAIM } from "@0xc1x/role-commons";
import type { QueryClient as QC } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { CookieBanner } from "@/components/cookie-banner";
import { absoluteUrl, organizationJsonLd } from "@/lib/seo";
import appCss from "../styles.css?url";

export interface RouterContext {
	queryClient: QC;
}

// `organizationJsonLd()` se llama DENTRO de `head()`, y no al importarlo como
// constante de módulo. Resolver el origen significa leer la env: hacerlo al
// importar convertía "importar la ruta raíz" en "tener el dominio configurado",
// y `root-query-client.test.tsx` —que importa este módulo y no tiene nada que
// ver con SEO— tiraba el error de arranque de `env.ts` antes de llegar a su
// propia aserción. Como función, el valor además es por request y no queda
// congelado con el entorno del primer import.

export const Route = createRootRouteWithContext<RouterContext>()({
	head: () => {
		const ogImage = absoluteUrl("/og.png");
		const ogImageAlt = "Rolé — rescata comida deliciosa a precio increíble";
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
					content: `Rolé — Comida deliciosa. ${DISCOUNT_MAX_CLAIM} menos.`,
				},
				{
					property: "og:description",
					content:
						"Rescata comida deliciosa a precio increíble. Conectamos comercios con excedente y personas que quieren comer bien por menos.",
				},
				{ property: "og:image", content: ogImage },
				{ property: "og:image:width", content: "1200" },
				{ property: "og:image:height", content: "630" },
				{ property: "og:image:alt", content: ogImageAlt },
				{ name: "twitter:card", content: "summary_large_image" },
				{
					name: "twitter:title",
					content: `Rolé — Comida deliciosa. ${DISCOUNT_MAX_CLAIM} menos.`,
				},
				{
					name: "twitter:description",
					content: "Rescata comida deliciosa a precio increíble.",
				},
				{ name: "twitter:image", content: ogImage },
				{ name: "twitter:image:alt", content: ogImageAlt },
			],
			links: [
				{ rel: "stylesheet", href: appCss },

				{ rel: "icon", type: "image/svg+xml", href: "/icon.svg?v=10" },
				{ rel: "icon", href: "/favicon.ico?v=10", sizes: "any" },
				{ rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
				{ rel: "manifest", href: "/site.webmanifest" },
			],
			scripts: [
				{
					type: "application/ld+json",
					children: JSON.stringify(organizationJsonLd()),
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
	// El QueryClient del router es el MISMO que primieron los loaders: `getRouter()`
	// lo crea y lo publica en `context.queryClient`, y los loaders de cada ruta
	// hacen `ensureQueryData` sobre esa instancia antes de que se produzca el
	// markup. Por eso el provider toma el del router en vez de crear otro: un
	// `useState(() => createAppQueryClient())` aquí abre una caché vacía, deja
	// los loaders resuelto en otra y el HTML servido sale con
	// `data-stats-source="loading"` y los emails de fallback aunque el payload de
	// hidratación de esa MISMA respuesta ya lleve las cifras reales. Los loaders
	// existen para SEO, así que sus datos tienen que llegar a los bytes.
	//
	// `router.options.context` es `PickAsRequired<RouterOptions, ... | 'context'>`
	// en @tanstack/router-core, y `InferRouterContext` lo tipa desde
	// `createRootRouteWithContext<RouterContext>()`: sin cast. Y es seguro
	// compartirlo porque `getRouter()` corre una vez por request en SSR (verificado
	// en el reporte), así que no hay caché que se filtre entre usuarios.
	const { queryClient } = useRouter().options.context;

	// La clase `js` abre el estado oculto del reveal (`html.js .reveal`), y por
	// eso tiene que estar en la raíz: si esperara a la ruta, el hueco sería
	// "todo invisible y sin observer". Este effect corre con `<html>` ya
	// reclamado —el root route no es lazy, se hidrata primero—, y por eso la
	// escritura no aparece en el diff de hidratación.
	//
	// El observer que escribe `data-revealed` en los hijos NO puede vivir acá:
	// las rutas de archivo van detrás de `lazyRouteComponent`, así que el
	// subárbol de la ruta todavía no está reclamado cuando este effect corre, y
	// React encuentra después un atributo que él no puso. Está en
	// `useRevealOnScroll`, que se llama DENTRO de cada ruta. Las medidas están
	// en el docblock de ese archivo; este comentario es el resumen.
	useEffect(() => {
		document.documentElement.classList.add("js");
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
