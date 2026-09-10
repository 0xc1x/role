/**
 * SEO compartido: dominio canónico y head() estándar para las rutas.
 * El dominio viene de VITE_SITE_URL o, en Vercel, de
 * VERCEL_PROJECT_PRODUCTION_URL (disponible en build y runtime).
 * Sin dominio (dev), canonical/og:url absolutos se omiten.
 */

import { env } from "./env";

function normalizeSiteUrl(raw: string): string | undefined {
	const trimmed = raw.trim().replace(/\/+$/, "");
	if (!trimmed) return undefined;
	if (/^https?:\/\//.test(trimmed)) {
		try {
			return new URL(trimmed).origin;
		} catch {
			return undefined;
		}
	}
	if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed)) return `https://${trimmed}`;
	return undefined;
}

export function getSiteUrl(): string | undefined {
	// Cliente (Vite hornea VITE_* en build) con fallback opcional: nitro no
	// reemplaza import.meta.env en el bundle SSR, ahí manda process.env.
	const fromVite = env.VITE_SITE_URL;
	if (fromVite) return normalizeSiteUrl(fromVite);
	if (typeof process !== "undefined") {
		const fromNode =
			process.env?.VITE_SITE_URL ?? process.env?.VERCEL_PROJECT_PRODUCTION_URL;
		if (fromNode) return normalizeSiteUrl(fromNode);
	}
	return undefined;
}

/** URL absoluta para canonical/og:url/sitemap; undefined si no hay dominio. */
export function absoluteUrl(path: string): string | undefined {
	const site = getSiteUrl();
	return site ? `${site}${path}` : undefined;
}

/** head() estándar de página indexable: title, description, canonical y og:url. */
export function pageHead(path: string, title: string, description: string) {
	const url = absoluteUrl(path);
	return {
		meta: [
			{ title },
			{ name: "description", content: description },
			...(url ? [{ property: "og:url", content: url }] : []),
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
		],
		links: url ? [{ rel: "canonical", href: url }] : [],
	};
}
