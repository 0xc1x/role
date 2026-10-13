import { z } from "zod";

import { apiUrlStartupError } from "./api-url";
import { siteUrlStartupError } from "./site-url";

/**
 * Env pública de la landing, validada una vez al importar el cliente API.
 *
 * ─── Por qué `VITE_API_URL` NO tiene default ─────────────────────────────────
 *
 * Antes: `api.ts` resolvía `env.VITE_API_URL ?? "http://localhost:4001/api/v1"`.
 * Eso es un destino QUE NADIE ELIGIÓ, y en un SSR app significa que "correr la
 * landing" y "llamar a un backend" son la misma acción sin que nadie lo note: si
 * la var faltaba, cada render SSR pegaba calladitas a un host que no está, cada
 * loader's `.catch()` se comía el error, y la página servía un 200 plausible
 * sin datos — hero en "—", emails de fallback. Un default silencioso no es
 * robustez: es un fallo con la etiqueta de "funciona".
 *
 * Ahora la ausencia es un error de arranque en el server, con el mensaje
 * compartido de `api-url.ts`. El BUILD no se valida a propósito: CI compila sin
 * la var (paso `Build` de .github/workflows/ci.yml) y el bundle de cliente se
 * arma con la env de Vercel; atar el build a una var rompería ambos. Lo que se
 * rompe es el arranque de quien va a hacer peticiones, que es donde el destino
 * se usaba en silencio.
 *
 * ─── Y por qué `VITE_SITE_URL` se valida con el MISMO trato ──────────────────
 *
 * Porque es el mismo defecto y más caro. `VITE_API_URL` ausente daba una
 * landing sin datos; `VITE_SITE_URL` ausente daba una landing que canonicaliza,
 * og:url y sitemap por el dominio equivocado —medido: el server arrancaba sin
 * ruido, `[seo] falta VITE_SITE_URL` pasaba en el log y a continuación cada
 * página servía `https://role.app` como su propia identidad. Eso no se ve
 * mirando la página: se ve tres meses después en Search Console. Un default
 * silencioso acá es un sitio desindexado con la etiqueta de "funciona".
 *
 * Los candidatos van en ORDEN y todos, no el primero: el bundle SSR no ve lo
 * que Vite horneó en el de cliente, así que en el servidor el dominio puede
 * llegar solo por `process.env`. Guardar `env.VITE_SITE_URL` sin más mataría un
 * deploy correctamente configurado.
 */
const EnvSchema = z.object({
	// El esquema de la URL vive en `api-url.ts` para poder validarlo también
	// desde `vite.config.ts`, que no puede importar este módulo (ver el
	// comentario de ese archivo).
	VITE_API_URL: z.url().optional(),
	VITE_SITE_URL: z.string().optional(),
});

export const env = EnvSchema.parse({
	VITE_API_URL: import.meta.env.VITE_API_URL,
	VITE_SITE_URL: import.meta.env.VITE_SITE_URL,
});

// En el server la ausencia es un error de arranque. `import.meta.env.SSR` es
// `true` en el bundle SSR y `false` en el de cliente, así que esta línea no
// afecta al navegador; y bajo `bun test` vale `undefined`, que es exactamente
// por lo que la suite no depende de que exista un `.env` local (CI no lo tiene).
if (import.meta.env.SSR) {
	const apiError = apiUrlStartupError(env.VITE_API_URL);
	if (apiError) throw apiError;

	const siteUrlError = siteUrlStartupError(
		env.VITE_SITE_URL,
		typeof process === "undefined"
			? undefined
			: (process.env?.VITE_SITE_URL ??
					process.env?.VERCEL_PROJECT_PRODUCTION_URL),
	);
	if (siteUrlError) throw siteUrlError;
}
