import { getConfigValue } from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";

import { appConfigQueryOptions, platformStatsQueryOptions } from "./queries";

/** Lee un valor de configuración con fallback (la landing nunca se bloquea). */
export function useConfig(key: string, fallback: string): string {
	const { data } = useQuery(appConfigQueryOptions);
	return getConfigValue(data, key, fallback);
}

/** Stats reales de la plataforma; `undefined` mientras carga o si falla la API. */
export function usePlatformStats() {
	return useQuery(platformStatsQueryOptions).data;
}
