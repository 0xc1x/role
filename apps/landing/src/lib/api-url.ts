import { z } from "zod";

/**
 * ─── Por qué este módulo existe separado de `env.ts` ─────────────────────────
 *
 * Porque `env.ts` lee `import.meta.env` en el scope del módulo, y eso lo hace
 * INIMPORTABLE desde `vite.config.ts`: Vite empaqueta el config con esbuild,
 * y en ese bundle `import.meta.env` no existe, así que importar `env.ts` desde
 * el config revienta el arranque con
 * `TypeError: Cannot read properties of undefined (reading 'VITE_API_URL')`
 * ANTES de que llegue a ejecutarse el check que uno quiere.
 *
 * Acá vive la política —qué es un destino válido y qué se dice cuando no lo
 * hay— sin tocar `import.meta.env`, así que el mismo archivo lo importan el
 * arranque del dev server (Node, en `vite.config.ts`) y el bundle del server
 * SSR. Verificado: este módulo se importa bien desde el config empaquetado.
 */

/** Un destino de API. Se valida como URL: `z.url()` exige esquema. */
export const ApiUrlSchema = z.url();

/**
 * Un solo mensaje para los dos puntos de arranque que fallan (el dev server en
 * `vite.config.ts` y el server SSR en `env.ts`). Que sea el mismo texto es lo
 * que hace que un error de arranque sea diagnosticable sin leer el stack.
 */
export const API_URL_REQUIRED_MESSAGE = [
	"[role:landing] falta VITE_API_URL y la landing no elige un destino por su cuenta.",
	"Copiá apps/landing/.env.example a apps/landing/.env, o exportá VITE_API_URL",
	"(con el prefijo /api/v1 incluido) antes de arrancar.",
].join(" ");

/**
 * Valida el destino de un proceso de arranque y devuelve el error, o `null`.
 *
 * Función pura a propósito: la comparten el arranque del dev server y el del
 * server SSR, y eso la vuelve testeable sin arrancar Vite ni falsificar
 * `import.meta.env`.
 *
 * La ausencia se trata acá explícitamente y no con `optional()`: en el
 * esquema de `env.ts` `VITE_API_URL` es opcional y `z.url().optional()`
 * acepta `undefined`, que era exactamente el agujero por el que `api.ts`
 * caía a su default `?? "http://localhost:4001/api/v1"`. Un destino no
 * elegido no es lo mismo que un destino por defecto.
 */
export function apiUrlStartupError(raw: string | undefined): Error | null {
	// `""` y `undefined` son el mismo error, y un `.env` con `VITE_API_URL=`
	// sin valor produce exactamente eso.
	if (raw === undefined || raw.trim() === "") {
		return new Error(API_URL_REQUIRED_MESSAGE);
	}
	// Una URL presente pero mal formada es PEOR que una ausente: con la
	// ausente el 404 es obvio; con `host/api/v1` (sin esquema) el fetch falla
	// de una forma que no señala la causa.
	const parsed = ApiUrlSchema.safeParse(raw);
	return parsed.success ? null : new Error(API_URL_REQUIRED_MESSAGE);
}
