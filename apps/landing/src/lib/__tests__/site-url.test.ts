/**
 * El dominio público de la landing: una sola política, un solo normalizador.
 *
 * El defecto que esto cubre es de TRES piezas que se contradicen entre sí, y que
 * por separado parecían razonables:
 *
 *  1. `seo.ts` normalizaba con `new URL(x).origin` — DESCARTABA el path.
 *  2. `seo-files.ts` normalizaba con un replace — CONSERVABA el path.
 *  3. `seo.ts`ava de `https://role.app` si la var faltaba, avisando por
 *     `console.warn`; `env.ts` hacía THROW por la misma clase de ausencia en
 *     `VITE_API_URL`.
 *
 * Con `VITE_SITE_URL=https://role.app/es`, el canonical de `/about` salía
 * `https://role.app/about` y el sitemap `https://role.app/es/about`: dos
 * orígenes para el mismo contenido, y el buscador expelled una mitad del sitio.
 *
 * Y lo que es peor: la var que decide si el sitio es indexable no tenía modo de
 * fallo. Sin ella, el server arrancaba perfecto y servía canonicals del dominio
 * de otro — medido: `[seo] falta VITE_SITE_URL` y a continuación canonicals de
 * `https://role.app` en un deploy de otro dominio. Un warning en un log es la
 * forma más cara de no enterarse.
 *
 * Acá vive la política, sin `import.meta.env`, para que la compartan el arranque
 * del dev server (`vite.config.ts`) y el bundle SSR (`env.ts`) y para que
 * `bun test src` la pueda verificar. Es el mismo chemin que `api-url.ts`.
 */
import { describe, expect, test } from "bun:test";
import {
	FALLBACK_SITE_URL,
	resolveSeoSiteUrl,
	resolveSiteUrl,
	SITE_URL_REQUIRED_MESSAGE,
	siteUrlStartupError,
} from "../site-url";

/** Un preview de Vercel y un staging: lo que de verdad se configura. */
const PREVIEW = "https://role-git-main-acme.vercel.app";
const STAGING = "https://staging.role.ec";

describe("resolveSiteUrl: un origen, siempre", () => {
	test("deja el origen tal cual si ya es absoluto", () => {
		expect(resolveSiteUrl(PREVIEW)).toBe(PREVIEW);
		expect(resolveSiteUrl(STAGING)).toBe(STAGING);
	});

	test("acepta un host pelado, como lo inyecta Vercel", () => {
		expect(resolveSiteUrl("role.app")).toBe("https://role.app");
		expect(resolveSiteUrl("role-git-main-acme.vercel.app")).toBe(
			"https://role-git-main-acme.vercel.app",
		);
	});

	test("quita la barra final", () => {
		expect(resolveSiteUrl("https://role.app/")).toBe("https://role.app");
		expect(resolveSiteUrl("https://role.app///")).toBe("https://role.app");
	});

	test("DESCARTA el path: canonical y sitemap tienen que coincidir", () => {
		// La regresión exacta. `/es` no significa nada para esta app —el router
		// no tiene basepath y `absoluteUrl()` concatena origen + ruta—, así que
		// lo único honesto es mirar el origen. Un sitemap en
		// `https://role.app/es/about` y un canonical en
		// `https://role.app/about` le dicen al buscador que hay dos sitios.
		expect(resolveSiteUrl("https://role.app/es")).toBe("https://role.app");
		expect(resolveSiteUrl("https://role.app/es/")).toBe("https://role.app");
	});

	test("acepta un puerto, para el loopback de la suite e2e", () => {
		// El regex anterior (`/^[a-z0-9.-]+\.[a-z]{2,}$/i`) no aceptaba `:`,
		// así que `localhost:3001` caía al fallback de producción: el dev server
		// anunciaba `https://role.app` como su propia identidad.
		expect(resolveSiteUrl("http://127.0.0.1:3101")).toBe(
			"http://127.0.0.1:3101",
		);
		expect(resolveSiteUrl("localhost:3001")).toBe("http://localhost:3001");
	});

	test("sin dominio devuelve undefined, NO un origen inventado", () => {
		// La ausencia tiene que ser DISTINGUIBLE de un valor. Con un fallback
		// adentro, `siteUrlStartupError` no puede differentiates: `""`,
		// `undefined` y `"role.app"` darían los tres un string truthy.
		expect(resolveSiteUrl(undefined)).toBeUndefined();
		expect(resolveSiteUrl("")).toBeUndefined();
		expect(resolveSiteUrl("   ")).toBeUndefined();
	});

	test("rechaza un valor presente pero inservible", () => {
		// Peor que ausente: con `""` el error se ve, con `no-es-un-dominio` el
		// canonical sale mal formado y nadie sabe por qué.
		expect(resolveSiteUrl("no es un dominio")).toBeUndefined();
		expect(resolveSiteUrl("http://")).toBeUndefined();
	});

	test("toma el primer candidato que resuelva", () => {
		// El orden de candidatos es la política de precedencia entre la var
		// horneada por Vite, `process.env` y la que inyecta Vercel.
		expect(resolveSiteUrl(undefined, undefined, STAGING)).toBe(STAGING);
		expect(resolveSiteUrl(undefined, PREVIEW, STAGING)).toBe(PREVIEW);
		// Un candidato inservible NO tapa al siguiente válido.
		expect(resolveSiteUrl("", PREVIEW)).toBe(PREVIEW);
	});
});

describe("resolveSeoSiteUrl: el mismo normalizador, con fallback para el build", () => {
	test("sin dominio cae al origen de producción", () => {
		// El build NO valida la var a propósito —CI compila sin ella y el bundle
		// de cliente se arma con el env de Vercel—, así que el plugin de
		// `vite.config.ts` necesita un origen en vez de una ausencia.
		expect(resolveSeoSiteUrl(undefined)).toBe(FALLBACK_SITE_URL);
		expect(resolveSeoSiteUrl("")).toBe(FALLBACK_SITE_URL);
		expect(resolveSeoSiteUrl("   ")).toBe(FALLBACK_SITE_URL);
		expect(resolveSeoSiteUrl("no es un dominio")).toBe(FALLBACK_SITE_URL);
	});

	test("con dominio configurado devuelve lo MISMO que resolveSiteUrl", () => {
		// La equivalencia es el contrato: si divergen, el sitemap y el canonical
		// vuelven a anunciar sitios distintos. Se afirman los valores concretos
		// —no `a === b`— porque comparar las dos funciones entre sí pasaría
		// happily si ambas se rompieran igual.
		const CASES: readonly [raw: string, expected: string][] = [
			[PREVIEW, PREVIEW],
			[STAGING, STAGING],
			["role.app", "https://role.app"],
			["https://role.app/es", "https://role.app"],
			["http://127.0.0.1:3101", "http://127.0.0.1:3101"],
		];
		for (const [raw, expected] of CASES) {
			expect(resolveSeoSiteUrl(raw)).toBe(expected);
			expect(resolveSiteUrl(raw)).toBe(expected);
		}
	});
});

describe("siteUrlStartupError: la ausencia es un error de arranque", () => {
	test("sin ningún candidato devuelve el error", () => {
		const error = siteUrlStartupError(undefined, undefined, undefined);
		expect(error).toBeInstanceOf(Error);
		expect(error?.message).toBe(SITE_URL_REQUIRED_MESSAGE);
	});

	test("con un candidato válido no hay error", () => {
		expect(siteUrlStartupError(undefined, PREVIEW, undefined)).toBeNull();
		expect(siteUrlStartupError(STAGING)).toBeNull();
	});

	test("un valor presente pero inservible también es error", () => {
		expect(siteUrlStartupError("no es un dominio")).toBeInstanceOf(Error);
	});

	test("el mensaje dice qué var falta y qué hacer", () => {
		// Sin esto el error es un `undefined` en una línea de un stack de nitro.
		expect(SITE_URL_REQUIRED_MESSAGE).toContain("VITE_SITE_URL");
		expect(SITE_URL_REQUIRED_MESSAGE).toContain(
			"VERCEL_PROJECT_PRODUCTION_URL",
		);
	});
});
