/**
 * Generador de `robots.txt` y `sitemap.xml`.
 *
 * Estos dos archivos son artefactos de build, no fuentes: `public/robots.txt` y
 * `public/sitemap.xml` están en `.gitignore` y el plugin `seoFiles` de
 * `vite.config.ts` los reescribe en cada build. La razón de que sean
 * generados y no estáticos es que cada deploy tiene que anunciar SU origen: un
 * sitemap commiteado con `https://role.app` hace que todos los previews de
 * Vercel y los entornos de staging le digan al mundo que son producción.
 *
 * La lógica pura vive acá, y no en el closure del plugin de Vite, para que sea
 * verificable: `bun test src` no puede importar `vite.config.ts` sin arrastrar
 * nitro, Tailwind y TanStack Start.
 */

/**
 * Rutas que el sitio pide que se indexen. `/business-signup` NO entra: su
 * `head()` declara `noindex, nofollow` y la decisión de no publicar la página
 * de alta en buscadores es del owner. Si esa decisión cambia, se cambia acá y
 * se cambia el `robots` de la ruta, no solo una de las dos.
 */
export const INDEXABLE_ROUTES = [
	"/",
	"/how-it-works",
	"/for-business",
	"/help-center",
	"/about",
	"/privacy",
	"/terms",
] as const;

/** Origen de respaldo cuando no hay dominio configurado. */
export const FALLBACK_SITE_URL = "https://role.app";

/**
 * Normaliza el dominio de build a un origen absoluto sin barra final.
 * Acepta con o sin esquema: Vercel inyecta `VERCEL_PROJECT_PRODUCTION_URL`
 * como host pelado y `VITE_SITE_URL` normalmente trae `https://`.
 */
export function resolveSeoSiteUrl(raw: string | undefined): string {
	const trimmed = raw?.trim().replace(/\/+$/, "");
	if (!trimmed) return FALLBACK_SITE_URL;
	return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function buildRobotsTxt(site: string): string {
	return ["User-agent: *", "Allow: /", `Sitemap: ${site}/sitemap.xml`, ""].join(
		"\n",
	);
}

export function buildSitemapXml(site: string): string {
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...INDEXABLE_ROUTES.map((route) => `<url><loc>${site}${route}</loc></url>`),
		"</urlset>",
		"",
	].join("\n");
}
