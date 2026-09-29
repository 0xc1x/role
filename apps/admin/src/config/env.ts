import { resolveApiUrl } from "./api-url";

/**
 * La URL de la API, resuelta una vez y validada para todo el panel.
 *
 * La regla vive en `api-url.ts` porque la necesita también el arranque
 * (`vite.config.ts`), que corre en Node y no puede importar `import.meta.env`.
 * Acá solo se adapta el valor de Vite al validador, para que un valor roto
 * muera al arrancar y no se convierta en un 500 opaco en cada ruta.
 */
const { url } = resolveApiUrl(import.meta.env.VITE_API_URL);

export const env = { VITE_API_URL: url };
