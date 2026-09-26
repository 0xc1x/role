import { getConfigValue, type PlatformStats } from "@0xc1x/role-commons";
import { useQuery, type QueryClient } from "@tanstack/react-query";

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
 * El valor sale de la caché que el loader priming, así que el atributo coincide
 * con el HTML servido (mismo `source`) y se corrige solo cuando una
 * reconsulta posterior sí trae datos.
 */
export function usePlatformStats(): PlatformStatsResult {
	const { data, status } = useQuery(platformStatsQueryOptions);
	// `data` primero: una query que ya trae datos y está revalidando sigue
	// siendo `api`. Sin datos, el estado de la query es lo que separa "todavía
	// no" de "no va a venir".
	const source: PlatformStatsSource =
		data !== undefined ? "api" : status === "pending" ? "loading" : "failed";
	return { data, source };
}
