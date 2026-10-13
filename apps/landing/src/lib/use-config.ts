import { getConfigValue, type PlatformStats } from "@0xc1x/role-commons";
import { type QueryClient, useQuery } from "@tanstack/react-query";

import { appConfigQueryOptions, platformStatsQueryOptions } from "./queries";

/** Lee un valor de configuración con fallback (la landing nunca se bloquea). */
export function useConfig(key: string, fallback: string): string {
	const { data } = useQuery(appConfigQueryOptions);
	return getConfigValue(data, key, fallback);
}

/**
 * Procedencia de las métricas publicadas, en tres estados y no en dos.
 *
 * - `api`: hay cifras reales de la respuesta.
 * - `loading`: la petición todavía no ha resuelto (navegación del lado del
 *   cliente, o primer render sin caché). No hay datos, pero tampoco hay fallo.
 * - `failed`: la petición de `/stats/platform` falló.
 *
 * POR QUÉ el tercer estado: con solo `api`/`fallback`, cargar se reportaba como
 * fallo. Con la API lenta, media redirección, o cualquier cliente que aún no
 * haya pintado, el HTML de un sitio sano llevaba `data-stats-source="fallback"`
 * — y quien estuviera de guardia no podía distinguir "se degradó" de "todavía
 * no ha llegado". En el HTML SERVIDO el loader SSR espera, así que ahí solo
 * aparecen `api` y `failed`: `loading` es un estado exclusive del cliente.
 */
export type PlatformStatsSource = "api" | "loading" | "failed";

export interface PlatformStatsResult {
	/** Métricas reales; `undefined` mientras carga o si falla la API. */
	data: PlatformStats | undefined;
	source: PlatformStatsSource;
}

/**
 * Resuelve las stats en el loader SSR degradando en vez de romper el render.
 *
 * POR QUÉ el discriminador: la landing nunca puede dejar de pintarse por SEO,
 * así que el fallo se absorbe. Pero una degradación indistinguible del dato real
 * no es auditable: esta página publica sus números (hero, "El impacto hasta
 * hoy") y un `0` por API caída se confunde con un `0` real. Devolver
 * `undefined` lo hacía indistinguible para siempre; el `source` viaja al markup
 * como `data-stats-source` y en el HTML servido.
 *
 * El loader no distingue `loading` porque no existe para él: `await` resuelve o
 * lanza, nunca "todavía no". Esa es también la garantía de que el HTML servido
 * nunca lleva `loading`.
 */
export async function ensurePlatformStats(
	queryClient: QueryClient,
): Promise<PlatformStatsResult> {
	try {
		const data = await queryClient.ensureQueryData(platformStatsQueryOptions);
		return { data, source: "api" };
	} catch {
		return { data: undefined, source: "failed" };
	}
}

/**
 * Mismas stats y mismo discriminador que el loader SSR.
 *
 * ─── POR QUÉ TOMA EL RESULTADO DEL LOADER ─────────────────────────────────────
 *
 * `delServidor` es lo que resolvió `ensurePlatformStats`. No es un extra: sin él
 * el primer render del navegador no tiene cifras.
 *
 * MEDIDO contra el dev server, con la caché del cliente VACÍA —que es lo que hay
 * tras hidratar, porque el SSR no deshidrata su estado en el payload; verificado
 * en `e2e/fixtures.ts`—:
 *
 *     t=   0ms  [20+ | 14+ | 8+]   ← HTML servido
 *     t=1560ms  [— | — | —]        ← primer render del cliente
 *     PAGEERROR Hydration failed because the server rendered text didn't match
 *
 * Sin el argumento, `data` es `undefined` en ese primer render, React compara
 * `"—"` contra el `20+` que él mismo puso en el HTML, descarta el subárbol del
 * Hero y lo regenera. Eso produce el parpadeo, y además mata la animación: al
 * remontar, `useCountUp` recibe el valor FINAL y `countUpFrom(20) < 20` no se
 * cumple, así que sale por `setDisplayed(value)` sin animar (`use-count-up.ts:64`).
 *
 * Este es el mismo patrón que `useAnnouncements` ya tenía desde antes, y por el
 * mismo motivo. La regla es una sola: mientras el observer no tenga respuesta,
 * contesta el loader; en cuanto la tenga, contesta el observer. Los cuatro
 * casos, medidos:
 *
 *   | server        | observer      | publicado |
 *   |---------------|---------------|-----------|
 *   | `api`         | `api`         | `api`     |
 *   | `failed`      | `loading`     | `failed`  | ← el que se estaba perdiendo
 *   | `api`, el cliente reintenta y falla     | `failed` | `failed`  |
 *   | `api`, el cliente reintenta y funciona  | `api`    | `api`     |
 *
 * El tercero importa: si un fallo del cliente se tapara con el valor del loader,
 * un incidente de red posterior al render nunca se publicaría.
 *
 * Y el caso sano no parpadea, porque el primer render devuelve lo del loader —
 * que es exactamente lo que el servidor puso en los bytes.
 */
export function usePlatformStats(
	delServidor: PlatformStatsResult,
): PlatformStatsResult {
	const { data, status } = useQuery(platformStatsQueryOptions);
	// `data` primero: una query que ya trae datos y está revalidando sigue
	// siendo `api`. Sin datos, el estado de la query es lo que separa "todavía
	// no" de "no va a venir".
	const delCliente: PlatformStatsResult = {
		data,
		source:
			data !== undefined ? "api" : status === "pending" ? "loading" : "failed",
	};
	return delCliente.source === "loading" ? delServidor : delCliente;
}
