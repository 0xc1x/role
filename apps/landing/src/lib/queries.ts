import type {
	AppConfigMap,
	OfferWithBusiness,
	PlatformStats,
} from "@0xc1x/role-commons";
import { queryOptions } from "@tanstack/react-query";

import { apiGet } from "./api";

export interface PublicConfigEntry {
	key: string;
	value: string | number | boolean;
	value_type: string;
}

/** Lista pública clave→valor de configuración de la plataforma. */
export const appConfigQueryOptions = queryOptions({
	queryKey: ["app-config", "public"],
	queryFn: () =>
		apiGet<PublicConfigEntry[]>("/app-config/public").then((entries) => {
			const map: AppConfigMap = {};
			for (const entry of entries) map[entry.key] = entry.value;
			return map;
		}),
	staleTime: 5 * 60_000,
});

/** Métricas reales calculadas por la API (users / businesses / meals_saved). */
export const platformStatsQueryOptions = queryOptions({
	queryKey: ["stats", "platform"],
	queryFn: () => apiGet<PlatformStats>("/stats/platform"),
	staleTime: 5 * 60_000,
});

/** Oferta activa aleatoria para la tarjeta flotante del hero. */
export const randomOfferQueryOptions = queryOptions({
	queryKey: ["offers", "random"],
	queryFn: () => apiGet<OfferWithBusiness | null>("/offers/random"),
	staleTime: 60_000,
});
