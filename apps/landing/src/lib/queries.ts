import {
	type AppConfigMap,
	type OfferWithBusiness,
	OfferWithBusinessSchema,
	type PlatformStats,
	PlatformStatsSchema,
	type PublicAppConfigDto,
	PublicAppConfigSchema,
} from "@0xc1x/role-commons";
import { queryOptions } from "@tanstack/react-query";

import { apiGet } from "./api";

/** Lista pública clave→valor de configuración de la plataforma. */
export const appConfigQueryOptions = queryOptions({
	queryKey: ["app-config", "public"],
	queryFn: async () => {
		const entries = await apiGet<PublicAppConfigDto[]>("/app-config/public");
		const map: AppConfigMap = {};
		for (const entry of entries) {
			const parsed = PublicAppConfigSchema.safeParse(entry);
			if (parsed.success) map[parsed.data.key] = parsed.data.value;
		}
		return map;
	},
	staleTime: 5 * 60_000,
});

/** Métricas reales calculadas por la API (users / businesses / meals_saved). */
export const platformStatsQueryOptions = queryOptions({
	queryKey: ["stats", "platform"],
	queryFn: async () => {
		const raw = await apiGet<unknown>("/stats/platform");
		const parsed = PlatformStatsSchema.safeParse(raw);
		if (!parsed.success) throw new Error("stats inválidos");
		const data: PlatformStats = parsed.data;
		return data;
	},
	staleTime: 5 * 60_000,
});

/** Oferta activa aleatoria para la tarjeta flotante del hero. */
export const randomOfferQueryOptions = queryOptions({
	queryKey: ["offers", "random"],
	queryFn: async () => {
		const raw = await apiGet<unknown>("/offers/random");
		if (raw === null) return null;
		const parsed = OfferWithBusinessSchema.safeParse(raw);
		if (!parsed.success) return null;
		const data: OfferWithBusiness = parsed.data;
		return data;
	},
	staleTime: 60_000,
});
