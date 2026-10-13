/**
 * ─── Por qué este módulo existe separado de `env.ts` ──────────────────────────
 *
 * Mismo motivo que `api-url.ts`, y por el mismo mecanismo: `env.ts` lee
 * `import.meta.env` en el scope del módulo, y eso lo vuelve INIMPORTABLE desde
 * `vite.config.ts` (Vite empaqueta el config con esbuild, y en ese bundle
 * `import.meta.env` no existe). Acá vive la política —qué es un dominio válido y
 * qué se dice cuando no lo hay— sin tocar `import.meta.env`, así que lo
 * importan el arranque del dev server y el del bundle SSR, y `bun test src` lo
 * verifica sin arrancar Vite.
 *
 * ─── Por qué un módulo y no una función más en `seo-files.ts` ─────────────────
 *
 * Porque los tres consumidores del dominio no son el mismo consumidor, y hasta
 * ahora cada uno normalizaba por su cuenta:
 *
 *   · `seo.ts`        → canonical, og:url, JSON-LD. Se lee en SSR **y** en el
 *                       cliente durante una navegación, así que necesita un
 *                       origen siempre.
 *   · `seo-files.ts`  → robots.txt y sitemap.xml. Se generan en build, donde la
 *                       var puede no estar, así que necesita un fallback.
 *   · `env.ts`        → el guard de arranque, que necesita distinguir AUSENCIA
 *                       de un valor: un fallback adentro haría que `""` y
 *                       `"role.app"` dieran el mismo string truthy y el error
 *                       de arranque no podría dispararse.
 *
 * `resolveSiteUrl` es el normalizador —sin fallback, `undefined` si no hay— y
 * los otros dos son políticas distintas sobre él.
 */

/**
 * Origen de último recurso. Solo lo usa el BUILD (ver `resolveSeoSiteUrl`): un
 * sitemap sin origen no le sirve a nadie, y el sitio real no puede ni arrancar
 * sin `VITE_SITE_URL` (ver `siteUrlStartupError`).
 */
export const FALLBACK_SITE_URL = "https://role.app";

/**
 * Un solo mensaje para los dos puntos de arranque que fallan (el dev server en
 * `vite.config.ts` y el server SSR en `env.ts`). Que sea el mismo texto es lo
 * que hace que un error de arranque sea diagnosticable sin leer el stack.
 */
export const SITE_URL_REQUIRED_MESSAGE = [
	"[role:landing] falta el dominio público del sitio y la landing no lo elige por su cuenta.",
	"Sin VITE_SITE_URL (o VERCEL_PROJECT_PRODUCTION_URL en Vercel) el canonical, og:url",
	"y el sitemap apuntan al dominio equivocado y el sitio no se indexa. Exportá",
	"VITE_SITE_URL=https://role.app antes de arrancar.",
].join(" ");

/**
 * Normaliza un dominio a un ORIGEN absoluto, sin barra final, o `undefined` si
 * no hay nada usable.
 *
 * Devolver el origen y no el string entered es la decisión que hace que
 * canonical y sitemap no puedan divergir: `absoluteUrl(path)` concatena
 * `getSiteUrl() + path`, así que cualquier componente que sobreviva al
 * normalizado (un `/es`, una query) aparecería en UNO de los dos artefactos y no
 * en el otro. `/es` no le significa nada a esta app —el router no tiene
 * basepath—, así que descartar el path es la única lectura honesta.
 *
 * Acepta las tres formas en que un deploy puede entregar el dominio: con
 * esquema (`https://role.app`), pelado como la inyecta Vercel (`role.app`), y
 * con puerto para el loopback de la suite e2e (`localhost:3001`).
 */
export function resolveSiteUrl(
	...candidates: (string | undefined)[]
): string | undefined {
	for (const candidate of candidates) {
		const trimmed = candidate?.trim();
		if (!trimmed) continue;

		// Con esquema: `URL` lo valida y `.origin` resuelve el path y la query.
		if (/^https?:\/\//i.test(trimmed)) {
			try {
				return new URL(trimmed).origin;
			} catch {
				continue;
			}
		}

		// Pelado. `URL` acepta `localhost:3001` pero lo interpreta como
		// esquema `localhost:` con path `3001`, así que hay que prefixarlo antes.
		// `URL` es también el validador: cualquier otra cosa cae al catch.
		//
		// El loopback es http y no https: el dev server y la suite e2e no
		// atienden TLS, así que prefijarlo con `https://` produciría un
		// canonical que nadie puede seguir — el mismo defecto que motiva todo
		// este módulo, en miniatura.
		const isLoopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(
			trimmed,
		);
		try {
			return new URL(`${isLoopback ? "http" : "https"}://${trimmed}`).origin;
		} catch {
			// Es la última rama del `for`: el loop sigue solo con el siguiente
			// candidato si este no resuelve.
		}
	}
	return undefined;
}

/**
 * El mismo normalizador, pero con origen de respaldo. Para el plugin de build.
 *
 * El build NO valida la var a propósito: CI compila sin ella y el bundle de
 * cliente se arma con el env de Vercel en el deploy, así que atar el build a una
 * variable rompería ambos sin mejorar la seguridad del resultado. El sitio real
 * no arranca sin la var (`siteUrlStartupError`), de modo que el fallback de acá
 * solo llega a archivos de un build que nadie va a servir.
 */
export function resolveSeoSiteUrl(raw: string | undefined): string {
	return resolveSiteUrl(raw) ?? FALLBACK_SITE_URL;
}

/**
 * Valida el dominio de un proceso de arranque y devuelve el error, o `null`.
 *
 * Función pura a propósito: la comparten el arranque del dev server y el del
 * server SSR, y eso la vuelve testeable sin arrancar Vite ni falsificar
 * `import.meta.env`.
 *
 * Acepta los candidatos EN ORDEN DE PRECEDENCIA, no un string: el bundle SSR no
 * ve lo que Vite horneó en el bundle de cliente, así que en el servidor el
 * origen puede llegar por `process.env` y no por `import.meta.env`. Guardar
 * solo el primero sería un guard que tumba un deploy correctamente configurado.
 */
export function siteUrlStartupError(
	...candidates: (string | undefined)[]
): Error | null {
	return resolveSiteUrl(...candidates)
		? null
		: new Error(SITE_URL_REQUIRED_MESSAGE);
}
