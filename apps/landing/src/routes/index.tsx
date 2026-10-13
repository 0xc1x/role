import { createFileRoute } from "@tanstack/react-router";

import { AnnouncementBanner } from "@/components/announcement-banner";
import { Contact } from "@/components/contact";
import { Cta } from "@/components/cta";
import { Faq } from "@/components/faq";
import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { Navbar } from "@/components/navbar";
import { Testimonials } from "@/components/testimonials";
import { FAQ_ITEMS } from "@/lib/faq";
import { appConfigQueryOptions, randomOfferQueryOptions } from "@/lib/queries";
import { pageHead } from "@/lib/seo";
import { ensureAnnouncements, useAnnouncements } from "@/lib/use-announcements";
import { ensurePlatformStats } from "@/lib/use-config";
import { useRevealOnScroll } from "@/lib/use-reveal-on-scroll";

const FAQ_JSON_LD = {
	"@context": "https://schema.org",
	"@type": "FAQPage",
	mainEntity: FAQ_ITEMS.map((item) => ({
		"@type": "Question",
		name: item.q,
		acceptedAnswer: { "@type": "Answer", text: item.a },
	})),
};

export const Route = createFileRoute("/")({
	component: LandingPage,
	// SSR: config + stats reales se resuelven en el server para SEO. Ningún
	// fallo rompe el render; el loader solo deja constancia de si las stats
	// salieron de la API (`source`) para que el markup lo exponga.
	//
	// Los avisos entran por `ensureAnnouncements` y NO por un `ensureQueryData`
	// pelado: es la misma degradación a `failed` que las stats, y es lo que
	// impide que un 500 de la API de anuncios se convierta en el error de la
	// landing entera. Un aviso que falta es una molestia; una página que no se
	// pinta es el final del negocio que esta página existe para conseguir.
	//
	// El loader devuelve el resultado de los avisos CON NOMBRE, y no la tupla del
	// `Promise.all`: `LandingPage` lo necesita leer, y leerlo por posición —la
	// segunda de cuatro— es un acoplamiento que un `Promise.all` reordenado rompe
	// en silencio.
	//
	// Las stats se devuelven también, y antes NO se devolvían con el argumento de
	// que "el observer lo recalcula". Eso era falso: un observer no puede
	// recalcular lo que no tiene. En el cliente la caché arranca vacía, el primer
	// render veía `undefined` y React regeneraba el Hero por mismatch de
	// hidratación —medido, con el `—` reemplazando al `20+` del HTML servido.
	// Los loaders existen para SEO: sus datos tienen que llegar a los bytes, y el
	// primer render del cliente tiene que ser el mismo que el crawler leyó.
	// Ver la tabla de los cuatro casos en `use-config.ts`.
	loader: async ({ context }) => {
		const [stats, announcements] = await Promise.all([
			ensurePlatformStats(context.queryClient),
			ensureAnnouncements(context.queryClient),
			context.queryClient
				.ensureQueryData(appConfigQueryOptions)
				.catch(() => undefined),
			context.queryClient
				.ensureQueryData(randomOfferQueryOptions)
				.catch(() => undefined),
		]);
		return { announcements, stats };
	},
	head: () => ({
		...pageHead(
			"/",
			"Rolé — rescata comida excedente cerca de ti",
			"Descubre ofertas de comida excedente de negocios locales, salva comida buena de terminar en la basura y ahorra en tu día a día.",
		),
		scripts: [
			{ type: "application/ld+json", children: JSON.stringify(FAQ_JSON_LD) },
		],
	}),
});

function LandingPage() {
	useRevealOnScroll();

	// El `source` se PUBLICA con el del loader mientras el observer no tenga
	// respuesta propia, y no al revés. La versión anterior —recalcularlo acá—
	// servía `loading` en el render del servidor, siempre: el resultado
	// optimista de `@tanstack/query-core` pone `pending` siempre que no haya
	// `data`, aunque la caché esté en `error`. Medido con `/announcements` en
	// 503: la caché decía `error` y el atributo decía `loading`. Ver
	// `use-announcements.ts` para el mecanismo y la tabla de los cuatro casos.
	const loaderData = Route.useLoaderData();
	const avisos = useAnnouncements(loaderData.announcements);

	// El aviso va DENTRO de la navbar, no antes del `<main>`.
	//
	// La navbar es `fixed`, así que el primer hijo de `<main>` queda dibujado
	// debajo de ella: la banda se veía translúcida bajo el `backdrop-blur` y, al
	// scrollear, la navbar se ponía sólida encima. La primera versión intentó
	// arreglarlo con un `pt` en `<main>`, y era un error de partida: el padding no
	// despeja nada, abre un hueco — y además empujaba el hero, que es
	// `min-h-[100vh] flex items-center` y está hecho para quedar bajo la navbar
	// transparente. Adentro del `<header>` no hay nada que reservar: la navbar
	// crece con el aviso y comparte su mismo cambio de color.
	// Las stats NO se leen acá: el Hero ya llama a `usePlatformStats` y es el que
	// pinta el bloque. Lo que se le pasa es el resultado del LOADER — lo que el
	// servidor resolvió — y dos observers para la misma query darían dos `source`
	// distintos, que es el mismatch que esto viene a arreglar.
	//
	// El `source` de los avisos se publica en `<main>`; el de las stats lo publica
	// el propio Hero, en su `<dl>`.
	return (
		<div className="min-h-screen">
			<Navbar>
				<AnnouncementBanner announcements={avisos.data ?? []} />
			</Navbar>
			{/*
			  `data-announcements-source` = "api" | "loading" | "failed": avisos
			  reales, petición en curso, o API caída. Va en el `<main>` y NO en la
			  banda, que ahora vive en la navbar, por el mismo motivo de siempre: la
			  banda no se pinta cuando no hay nada que decir. Sin este atributo, "no
			  hay avisos" y "la API de anuncios está caída" serían la misma página —
			  indistinguibles para el que esté de guardia, que es exactamente el
			  incidente que el servicio de la API evita tapar devolviendo `[]`.
			*/}
			<main id="main" data-announcements-source={avisos.source}>
				<Hero statsDelServidor={loaderData.stats} />
				<Features />
				<HowItWorks />
				<Testimonials />
				<Faq />
				<Contact />
				<Cta />
			</main>
			<Footer />
		</div>
	);
}
