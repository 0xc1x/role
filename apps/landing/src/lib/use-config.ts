import { getConfigValue, type PlatformStats } from "@0xc1x/role-commons";
import { useQuery, type QueryClient } from "@tanstack/react-query";

import { appConfigQueryOptions, platformStatsQueryOptions } from "./queries";

/** Lee un valor de configuración con fallback (la landing nunca se bloquea). */
export function useConfig(key: string, fallback: string): string {
	const { data } = useQuery(appConfigQueryOptions);
	return getConfigValue(data, key, fallback);
}

/**
 * Procedencia de las métricas publicadas: respuesta real de la API o
 * degradación. `api` solo cuando hay datos; cualquier otro estado (cargando o
 * fallido) se reporta como `fallback` porque no hay cifras reales que publicar.
 */
export type PlatformStatsSource = "api" | "fallback";

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
 */
export async function ensurePlatformStats(
	queryClient: QueryClient,
): Promise<PlatformStatsResult> {
	try {
		const data = await queryClient.ensureQueryData(platformStatsQueryOptions);
		return { data, source: "api" };
	} catch {
		return { data: undefined, source: "fallback" };
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
	const { data } = useQuery(platformStatsQueryOptions);
	return { data, source: data === undefined ? "fallback" : "api" };
}
