/**
 * SEO compartido: dominio canónico y head() estándar para las rutas.
 *
 * EL ORIGEN NO SE ADIVINA. Viene de VITE_SITE_URL o, en Vercel, de
 * VERCEL_PROJECT_PRODUCTION_URL (Vercel la inyecta en build y en runtime), y si
 * no hay ninguno el server NO ARRANCA: `env.ts` valida la var al importar el
 * bundle SSR y tira. Antes este módulo caía a `https://role.app` con un
 * `console.warn`, y el resultado medido era un deploy de otro dominio sirviendo
 * canonicals, og:url y sitemap del de producción — el sitio entero fuera del
 * índice, con la única señal en un log que nadie lee. Para un default así, no
 * arrancar es más barato que arrancar mal: ver el razonamiento de
 * `VITE_API_URL` en `api-url.ts`, que es el mismo problema con la misma
 * solución.
 *
 * La normalización vive en `site-url.ts`, el mismo módulo que usa
 * `seo-files.ts` para el sitemap. Que sea uno solo es lo que garantiza que
 * canonical y sitemap no puedan anunciar sitios distintos.
 */

import { env } from "./env";
import { LAUNCH_CITIES } from "./faq";
import { resolveSiteUrl, SITE_URL_REQUIRED_MESSAGE } from "./site-url";

/**
 * El origen del sitio, ya normalizado a un absolute sin barra final.
 *
 * El orden de candidatos NO es un detalle: el bundle SSR no ve lo que Vite
 * horneó en el bundle de cliente, así que en el servidor el dominio puede llegar
 * por `process.env` y no por `import.meta.env`. `env` primero porque es lo que
 * el cliente conoce; `process.env` después porque es lo que el servidor conoce.
 * Los dos tienen que estar en la lista o el guard de `env.ts` y esta función
 * pueden discrepar.
 */
export function getSiteUrl(): string {
	const fromNode =
		typeof process === "undefined"
			? undefined
			: (process.env?.VITE_SITE_URL ??
				process.env?.VERCEL_PROJECT_PRODUCTION_URL);

	const site = resolveSiteUrl(env.VITE_SITE_URL, fromNode);

	// `env.ts` ya impidió el arranque en SSR cuando falta, así que llegar acá sin
	// origen solo puede ser el bundle de cliente durante una navegación —y ese
	// no tiene a quién avisarle salvo con el mismo error. Se tira con el mensaje
	// compartido para que el diagnóstico no dependa de dónde se lea.
	if (!site) throw new Error(SITE_URL_REQUIRED_MESSAGE);

	return site;
}

/** URL absoluta para canonical/og:url/sitemap; siempre absoluta. */
export function absoluteUrl(path: string): string {
	return `${getSiteUrl()}${path}`;
}

/** head() estándar de página indexable: title, description, canonical y og:url. */
export function pageHead(path: string, title: string, description: string) {
	const url = absoluteUrl(path);
	return {
		meta: [
			{ title },
			{ name: "description", content: description },
			{ property: "og:url", content: url },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
		],
		links: [{ rel: "canonical", href: url }],
	};
}

/**
 * `Organization` con la señal territorial del negocio.
 *
 * `areaServed` sale de `LAUNCH_CITIES`, el mismo export que usa el copy del FAQ
 * y el formulario de contacto, así que la lista no puede duplicarse: si se abre
 * una ciudad, el JSON-LD la nombra porque la nombra todo lo demás.
 *
 * LO QUE ESTE OBJETO NO TIENE, Y POR QUÉ:
 *
 *  · `address`. No hay domicilio legal publicado —`legal.controller_identity`
 *    dice "identidad legal pendiente de publicación"— y un `PostalAddress`
 *    inventado es structured data falso en un sitio que además pide
 *    consentimiento de datos en `/privacy`.
 *  · `sameAs`. Las seis filas `social.*_url` todavía no existen (las crea
 *    alguien en admin, ver `store-links.ts`); el array saldría vacío. Además,
 *    `head()` no es un componente y no puede leer `useConfig`, que es un hook de
 *    react-query: llenarlo exige un `loader` en la ruta raíz. Que se agregue
 *    cuando haya URLs reales, que es cuando sirve de algo.
 *  · `logo` como raster. Hoy apunta a `icon.svg`; la guía de Google para
 *    `Organization.logo` prefiere una imagen raster. Se deja como está porque
 *    cambiar el asset es una decisión de diseño, no de SEO.
 */
export function organizationJsonLd() {
	return {
		"@context": "https://schema.org",
		"@type": "Organization",
		name: "Rolé",
		url: absoluteUrl("/"),
		logo: absoluteUrl("/icon.svg"),
		description:
			"Marketplace de comida excedente: rescata comida de comercios locales a mejor precio y reduce el desperdicio.",
		areaServed: LAUNCH_CITIES.map((name) => ({
			"@type": "City",
			name,
			containedInPlace: { "@type": "Country", name: "Ecuador" },
		})),
	};
}
