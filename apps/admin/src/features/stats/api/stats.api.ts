import type {
	PlatformStats,
	RevenueStats,
	RevenueStatsQuery,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

export const statsApi = {
	platform: () => api.get<PlatformStats>("/stats/platform"),
	/**
	 * Reporte de dinero del período. Admin-only en la API: es la superficie que
	 * responde "¿estamos ganando dinero?" y no puede quedar detrás de la RPC
	 * pública de `/stats/platform`.
	 *
	 * `from`/`to` viajan solo si el panel los tiene; si faltan, la API resuelve
	 * su default y devuelve la ventana efectiva en `period`.
	 */
	revenue: (query?: RevenueStatsQuery) =>
		api.get<RevenueStats>(`/stats/revenue${toSearchParams(query)}`),
};
