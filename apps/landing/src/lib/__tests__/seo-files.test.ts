/**
 * `robots.txt` y `sitemap.xml` se generan en build; no son fuentes.
 *
 * El defecto que esto cubre: ambos archivos commiteados con `https://role.app`
 * hardcodeado hacen que cada preview de Vercel y cada staging le anuncien al
 * mundo que son producción, y que el sitemap no pueda seguir la variable de
 * entorno que el resto del sitio sí respeta.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	buildRobotsTxt,
	buildSitemapXml,
	FALLBACK_SITE_URL,
	INDEXABLE_ROUTES,
	resolveSeoSiteUrl,
} from "../seo-files";

const PREVIEW = "https://role-git-main-acme.vercel.app";
const STAGING = "https://staging.role.ec";

describe("resolveSeoSiteUrl", () => {
	test("usa el dominio configurado", () => {
		expect(resolveSeoSiteUrl(PREVIEW)).toBe(PREVIEW);
		expect(resolveSeoSiteUrl(STAGING)).toBe(STAGING);
	});

	test("acepta un host sin esquema, como lo inyecta Vercel", () => {
		expect(resolveSeoSiteUrl("role.app")).toBe("https://role.app");
		expect(resolveSeoSiteUrl("my-project-git-main-acme.vercel.app")).toBe(
			"https://my-project-git-main-acme.vercel.app",
		);
	});

	test("quita la barra final para no duplicar la barra en las URLs", () => {
		expect(resolveSeoSiteUrl("https://role.app/")).toBe("https://role.app");
		expect(resolveSeoSiteUrl("https://role.app///")).toBe("https://role.app");
	});

	test("sin dominio configurado cae al fallback de producción", () => {
		// Un origen de más es preferible a un sitemap sin línea Sitemap, pero el
		// build avisa: `vite.config.ts` loguea un warning en este caso.
		expect(resolveSeoSiteUrl(undefined)).toBe(FALLBACK_SITE_URL);
		expect(resolveSeoSiteUrl("")).toBe(FALLBACK_SITE_URL);
		expect(resolveSeoSiteUrl("   ")).toBe(FALLBACK_SITE_URL);
	});
});

describe("sitemap generado", () => {
	test("refleja el sitio configurado, no el de producción", () => {
		const sitemap = buildSitemapXml(resolveSeoSiteUrl(PREVIEW));
		for (const route of INDEXABLE_ROUTES) {
			expect(sitemap).toContain(`<loc>${PREVIEW}${route}</loc>`);
		}
		// La regresión exacta: el preview no puede decir `role.app`.
		expect(sitemap).not.toContain(FALLBACK_SITE_URL);
	});

	test("staging tampoco se anuncia como producción", () => {
		expect(buildSitemapXml(resolveSeoSiteUrl(STAGING))).not.toContain(
			FALLBACK_SITE_URL,
		);
	});

	test("excluye /business-signup, que es noindex a propósito", () => {
		// Decisión del owner: la página de alta no se publica. Su `head()`
		// declara `noindex, nofollow`; el sitemap tiene que estar de acuerdo.
		expect(INDEXABLE_ROUTES).not.toContain("/business-signup");
		for (const site of [PREVIEW, STAGING, FALLBACK_SITE_URL]) {
			expect(buildSitemapXml(site)).not.toContain("/business-signup");
		}
	});

	test("produce un urlset bien formado", () => {
		const sitemap = buildSitemapXml(FALLBACK_SITE_URL);
		expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(
			true,
		);
		expect(sitemap).toContain(
			'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		);
		expect(sitemap.trimEnd().endsWith("</urlset>")).toBe(true);
		// Una etiqueta por ruta, ni una más ni una menos.
		expect(sitemap.match(/<url>/g)).toHaveLength(INDEXABLE_ROUTES.length);
	});
});

describe("robots generado", () => {
	test("apunta al sitemap del mismo entorno", () => {
		expect(buildRobotsTxt(resolveSeoSiteUrl(PREVIEW))).toContain(
			`Sitemap: ${PREVIEW}/sitemap.xml`,
		);
		expect(buildRobotsTxt(resolveSeoSiteUrl(STAGING))).toContain(
			`Sitemap: ${STAGING}/sitemap.xml`,
		);
	});

	test("siempre declara una línea Sitemap", () => {
		for (const raw of [PREVIEW, STAGING, undefined]) {
			expect(buildRobotsTxt(resolveSeoSiteUrl(raw))).toMatch(
				/^Sitemap: https?:\/\/\S+\/sitemap\.xml$/m,
			);
		}
	});
});

describe("los dos archivos siguen siendo artefactos, no fuentes", () => {
	// Si alguien saca estas rutas del .gitignore y commitea un sitemap con
	// `role.app`, el sitio entero vuelve a anunciar producción en cada preview.
	const gitignore = readFileSync(
		new URL("../../../.gitignore", import.meta.url),
		"utf8",
	);

	test("public/robots.txt está ignorado por git", () => {
		expect(gitignore).toContain("public/robots.txt");
	});

	test("public/sitemap.xml está ignorado por git", () => {
		expect(gitignore).toContain("public/sitemap.xml");
	});
});
