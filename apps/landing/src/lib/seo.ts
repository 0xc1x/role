/**
 * SEO compartido: dominio canónico y head() estándar para las rutas.
 * El dominio viene de VITE_SITE_URL o, en Vercel, de
 * VERCEL_PROJECT_PRODUCTION_URL (disponible en build y runtime).
 * Sin dominio configurado se usa https://role.app como fallback con un
 * warning: canonical/og:url/og:image siempre son absolutos en producción.
 */

import { env } from "./env";

const FALLBACK_SITE_URL = "https://role.app";

let warnedMissingSiteUrl = false;

function warnMissingSiteUrl() {
	if (warnedMissingSiteUrl) return;
	warnedMissingSiteUrl = true;
	console.warn(
		"[seo] falta VITE_SITE_URL (y VERCEL_PROJECT_PRODUCTION_URL): usando fallback https://role.app",
	);
}

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

export function getSiteUrl(): string {
	// Cliente (Vite hornea VITE_* en build) con fallback opcional: nitro no
	// reemplaza import.meta.env en el bundle SSR, ahí manda process.env.
	const fromVite = env.VITE_SITE_URL;
	if (fromVite) {
		const normalized = normalizeSiteUrl(fromVite);
		if (normalized) return normalized;
	}
	if (typeof process !== "undefined") {
		const fromNode =
			process.env?.VITE_SITE_URL ?? process.env?.VERCEL_PROJECT_PRODUCTION_URL;
		if (fromNode) {
			const normalized = normalizeSiteUrl(fromNode);
			if (normalized) return normalized;
		}
	}
	warnMissingSiteUrl();
	return FALLBACK_SITE_URL;
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
