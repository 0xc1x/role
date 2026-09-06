/**
 * SEO compartido: dominio canónico y head() estándar para las rutas.
 * El dominio viene de VITE_SITE_URL o, en Vercel, de
 * VERCEL_PROJECT_PRODUCTION_URL (disponible en build y runtime).
 * Sin dominio (dev), canonical/og:url absolutos se omiten.
 */

function normalizeSiteUrl(raw: string): string {
	const trimmed = raw.replace(/\/+$/, "");
	return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function getSiteUrl(): string | undefined {
	const fromVite = import.meta.env.VITE_SITE_URL as string | undefined;
	if (fromVite) return normalizeSiteUrl(fromVite);
	if (typeof process !== "undefined") {
		const fromVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
		if (fromVercel) return normalizeSiteUrl(fromVercel);
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
		],
		links: url ? [{ rel: "canonical", href: url }] : [],
	};
}
