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
 *
 * EL DOMINIO NO SE NORMALIZA ACÁ. `buildRobotsTxt` y `buildSitemapXml` reciben
 * un origen ya resuelto y lo interpolan tal cual; resolverlo es trabajo de
 * `site-url.ts`, el mismo módulo que usa `seo.ts` para el canonical. Antes cada
 * uno tenía su normalizador y no coincidían —este conservaba el path
 * configurado, `seo.ts` lo descartaba con `.origin`—, así que con
 * `VITE_SITE_URL=https://role.app/es` el sitemap anunciaba
 * `https://role.app/es/about` y el canonical de esa misma página
 * `https://role.app/about`: dos orígenes para el mismo contenido. La
 * normalización vive en un lugar porque no puede haber dos respuestas.
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
