import {
	AnnouncementSchema,
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

/**
 * Los avisos del operador que le tocan a quien pregunta. Sin cabecera
 * `Authorization`: la landing no tiene sesión, y `GET /announcements` es
 * `@Public()` —la `RLS` deja ver a un anónimo los `all` y los `consumers`, que
 * es justamente lo que un sitio de marketing necesita para poder avisarle a
 * alguien que todavía no se registró.
 *
 * Lo que decide a quién le toca cada aviso es la policy de Supabase, entera, y
 * esta consulta no reimplementa ninguno de sus cinco términos: `active`, la
 * ventana `start_at`/`end_at` y la audiencia se resuelven donde vive la fila.
 * Si algo de eso estuviera también en el cliente, la regla quedaría escrita dos
 * veces y solo se corregiría la que nadie mira.
 *
 * Un shape que no encaja FALLA, no degrada a lista vacía: "no hay avisos" y "la
 * respuesta no es la que esperamos" son cosas distintas y colapsarlas sería un
 * incidente invisible en el sitio. El que absorbe el fallo es
 * `ensureAnnouncements` (`use-announcements.ts`), no esta función.
 *
 * El `staleTime` es corto a propósito —un minuto, como el de la oferta al azar—
 * porque un aviso tiene ventana de vida: un `end_at` que ya pasó no lo saca de
 * la página, solo lo saca la siguiente respuesta. Un `staleTime` largo dejaría un
 * aviso vencido en pantalla hasta que expirara.
 */
export const announcementsQueryOptions = queryOptions({
	queryKey: ["announcements", "audience"],
	queryFn: async () => {
		const raw = await apiGet<unknown>("/announcements");
		const parsed = AnnouncementSchema.array().safeParse(raw);
		if (!parsed.success) throw new Error("anuncios inválidos");
		return parsed.data;
	},
	staleTime: 60_000,
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
