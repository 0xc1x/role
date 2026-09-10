import type { BusinessType } from "@0xc1x/role-commons";

import { supabase } from "@/core/supabase/client";
import { toAppError } from "@/core/error/mapper";
import { Errors } from "@/core/error/app-error";

import type {
	AreaStat,
	BusinessSummary,
	CategoryStat,
	EmbeddedBusiness,
	EmbeddedCategory,
	EmbeddedLocation,
	OfferDetail,
	} from "../domain/offer";
import { OFFER_SELECT } from "./offer-select";

export const expiringSoonWindowHours = 3;

type Row = Record<string, unknown>;

/** Punto de referencia + radio (km) para el filtro geoespacial server-side. */
type RadiusParams = { lat: number; lng: number; radiusKm?: number };

export const offersRepository = {
	async getPopularOffers(radiusParams?: RadiusParams, limit = 10): Promise<OfferDetail[]> {
		return fetchOffersNear({
			radiusParams,
			limit,
			errorLabel: "Error al cargar ofertas populares",
		});
	},

	async getPopularOffersFiltered(
		category: string | null,
		radiusParams?: RadiusParams,
		limit = 10,
	): Promise<OfferDetail[]> {
		return fetchOffersNear({
			radiusParams,
			category,
			limit,
			errorLabel: "Error al cargar ofertas populares",
		});
	},

	async getExpiringSoonOffers(radiusParams?: RadiusParams, limit = 5): Promise<OfferDetail[]> {
		return fetchOffersNear({
			radiusParams,
			sort: "pickup_end",
			expiringWithinHours: expiringSoonWindowHours,
			limit,
			errorLabel: "Error al cargar ofertas por expirar",
		});
	},

	async getRecentOffers(radiusParams?: RadiusParams, limit = 5): Promise<OfferDetail[]> {
		return fetchOffersNear({
			radiusParams,
			limit,
			errorLabel: "Error al cargar ofertas recientes",
		});
	},

	async getNearbyOffers(params: {
		lat: number;
		lng: number;
		radiusKm?: number;
		limit?: number;
		category?: string | null;
	}): Promise<OfferDetail[]> {
		const { lat, lng, radiusKm = 5, limit = 20, category = null } = params;
		return fetchOffersNear({
			radiusParams: { lat, lng, radiusKm },
			category,
			sort: "distance",
			limit,
			errorLabel: "Error al cargar ofertas cercanas",
		});
	},

	async getFilteredOffers(params: {
		lat?: number;
		lng?: number;
		category?: string | null;
		maxPrice?: number | null;
		maxDistanceKm?: number | null;
		searchQuery?: string | null;
		page?: number;
		limit?: number;
	}): Promise<OfferDetail[]> {
		const {
			category = null,
			maxPrice = null,
			maxDistanceKm = null,
			searchQuery = null,
			page = 0,
			limit,
		} = params as typeof params & { page?: number; limit?: number };
		const radiusParams =
			maxDistanceKm != null && params.lat != null && params.lng != null
				? { lat: params.lat, lng: params.lng, radiusKm: maxDistanceKm }
				: undefined;
		return fetchOffersNear({
			radiusParams,
			category,
			maxPrice,
			search: searchQuery != null && searchQuery.length > 0 ? searchQuery : null,
			limit: limit ?? 100,
			offset: page * (limit ?? 0),
			errorLabel: "Error al filtrar ofertas",
		});
	},

	async getOfferById(id: string): Promise<OfferDetail> {
		const { data, error } = await supabase
			.from("offers")
			.select(OFFER_SELECT)
			.eq("id", id)
			.maybeSingle();
		if (error) throw toAppError(error, "Error al cargar la oferta");
		if (!data) throw Errors.notFound("La oferta ya no está disponible");
		return mapOfferDetail(data as unknown as Row);
	},

	async getCategories(): Promise<EmbeddedCategory[]> {
		const { data, error } = await supabase
			.from("categories")
			.select("id, name, slug, emoji, image_url, active")
			.eq("active", true)
			.order("name", { ascending: true });
		if (error) throw toAppError(error, "Error al cargar categorías");
		return toRows(data).map((c) => ({
			id: String(c.id),
			name: String(c.name),
			slug: (c.slug as string | null) ?? null,
			emoji: (c.emoji as string | null) ?? null,
			image_url: (c.image_url as string | null) ?? null,
			active: (c.active as boolean | null) ?? true,
		}));
	},

	async getCategoryStats(): Promise<CategoryStat[]> {
		const { data, error } = await supabase.rpc("active_offer_category_counts");
		if (error) throw toAppError(error, "Error al cargar categorías");
		const stats: CategoryStat[] = toRows(data).map((c) => ({
			id: String(c.id),
			name: String(c.name),
			count: numOrNull(c.active_count) ?? 0,
			emoji: (c.emoji as string | null) ?? "",
			imageUrl: (c.image_url as string | null) ?? "",
		}));
		stats.sort((a, b) => b.count - a.count);
		return stats;
	},

	async getPopularAreas(
		near?: { lat: number; lng: number; radiusKm?: number },
	): Promise<AreaStat[]> {
		try {
			const { data, error } = await supabase.rpc("popular_zones", {
				p_lat: near?.lat ?? null,
				p_lng: near?.lng ?? null,
				p_radius_km: near?.radiusKm ?? 5,
				p_limit: 5,
			});
			if (error) return [];
			return toRows(data).map((row) => ({
				name: String(row.zone),
				deals: numOrNull(row.deals) ?? 0,
			}));
		} catch {
			return [];
		}
	},

	async getNearbyBusinesses(radiusParams?: RadiusParams, limit = 5): Promise<BusinessSummary[]> {
		return fetchBusinessesNear({
			radiusParams,
			sort: "distance",
			limit,
			errorLabel: "Error al cargar negocios cercanos",
		});
	},

	async getAllBusinesses(params: {
		lat?: number | null;
		lng?: number | null;
		radiusKm?: number;
		searchQuery?: string | null;
		type?: string | null;
		limit?: number;
		page?: number;
	}): Promise<BusinessSummary[]> {
		const {
			lat = null,
			lng = null,
			radiusKm = 10,
			searchQuery = null,
			type = null,
			limit = 50,
			page = 0,
		} = params as typeof params & { page?: number };
		return fetchBusinessesNear({
			radiusParams: lat != null && lng != null ? { lat, lng, radiusKm } : undefined,
			search: searchQuery != null && searchQuery.length > 0 ? searchQuery : null,
			type,
			sort: "deals",
			limit,
			offset: page * limit,
			errorLabel: "Error al cargar negocios",
		});
		},
	};

/**
 * active_offers_near: filtra (geo, categoría, precio, búsqueda, ventana de
 * expiración), ordena y pagina en la base de datos — mismo shape embebido que
 * OFFER_SELECT + distance_km. Con radiusParams ausente no hay filtro geo.
 */
async function fetchOffersNear(options: {
	radiusParams?: RadiusParams;
	category?: string | null;
	sort?: "created_at" | "distance" | "pickup_end";
	expiringWithinHours?: number;
	maxPrice?: number | null;
	search?: string | null;
	limit?: number;
	offset?: number;
	errorLabel: string;
}): Promise<OfferDetail[]> {
	const {
		radiusParams,
		category = null,
		sort = "created_at",
		expiringWithinHours = null,
		maxPrice = null,
		search = null,
		limit = 20,
		offset = 0,
		errorLabel,
	} = options;
	const { data, error } = await supabase.rpc("active_offers_near", {
		p_lat: radiusParams?.lat ?? null,
		p_lng: radiusParams?.lng ?? null,
		p_radius_km: radiusParams?.radiusKm ?? null,
		p_category_id: category,
		p_sort: sort,
		p_expiring_within_hours: expiringWithinHours,
		p_max_price: maxPrice,
		p_search: search,
		p_limit: limit,
		p_offset: offset,
	});
	if (error) throw toAppError(error, errorLabel);
	return toRows(data).map(mapOfferDetail);
}

/** active_businesses_near: negocios deduplicados server-side con ubicación más cercana. */
async function fetchBusinessesNear(options: {
	radiusParams?: RadiusParams;
	search?: string | null;
	type?: string | null;
	sort?: "deals" | "distance";
	limit?: number;
	offset?: number;
	errorLabel: string;
}): Promise<BusinessSummary[]> {
	const {
		radiusParams,
		search = null,
		type = null,
		sort = "deals",
		limit = 50,
		offset = 0,
		errorLabel,
	} = options;
	const { data, error } = await supabase.rpc("active_businesses_near", {
		p_lat: radiusParams?.lat ?? null,
		p_lng: radiusParams?.lng ?? null,
		p_radius_km: radiusParams?.radiusKm ?? null,
		p_search: search,
		p_type: type,
		p_sort: sort,
		p_limit: limit,
		p_offset: offset,
	});
	if (error) throw toAppError(error, errorLabel);
	return toRows(data).map(mapBusinessSummary);
}

function mapBusinessSummary(row: Row): BusinessSummary {
	return {
		id: String(row.id),
		name: String(row.name ?? ""),
		type: (row.type as string | null) ?? "other",
		imageUrl: (row.image as string | null) ?? null,
		latitude: numOrNull(row.latitude),
		longitude: numOrNull(row.longitude),
		rating: numOrNull(row.rating) ?? 0,
		address: (row.address as string | null) ?? "",
		businessLocationId: (row.business_location_id as string | null) ?? null,
		zone: (row.zone as string | null) ?? null,
		reviewCount: (row.review_count as number | null) ?? 0,
		activeDealsCount: (row.active_deals_count as number | null) ?? 0,
		distanceKm: numOrNull(row.distance_km),
	};
}

function toRows(data: unknown): Row[] {
	return Array.isArray(data) ? (data as Row[]) : [];
}

function mapOfferDetail(row: Row): OfferDetail {
	const businessRow = (row.businesses ?? {}) as Row;
	const locationRow = row.business_locations as Row | null;

	const business: EmbeddedBusiness = {
		id: String(businessRow.id ?? row.business_id),
		name: String(businessRow.name ?? ""),
		type: (businessRow.type as BusinessType | null) ?? "other",
		image: (businessRow.image as string | null) ?? null,
		rating: numOrNull(businessRow.rating) ?? 0,
		review_count: (businessRow.review_count as number | null) ?? 0,
	};

	const location: EmbeddedLocation | null = locationRow
		? {
				id: String(locationRow.id ?? ""),
				name: (locationRow.name as string | null) ?? "",
				address: (locationRow.address as string | null) ?? "",
				latitude: numOrNull(locationRow.latitude) ?? 0,
				longitude: numOrNull(locationRow.longitude) ?? 0,
				zone: (locationRow.zone as string | null) ?? null,
			}
		: null;

	const categories = embeddedCategories(row.offer_categories);

	return {
		offer: {
			id: String(row.id),
			business_id: String(row.business_id),
			business_location_id: String(row.business_location_id ?? ""),
			title: String(row.title),
			description: (row.description as string | null) ?? null,
			image: (row.image as string | null) ?? null,
			category_ids: categories.map((c) => c.id),
			original_price: numOrNull(row.original_price) ?? 0,
			discounted_price: numOrNull(row.discounted_price) ?? 0,
			discount_percentage: null,
			stock: (row.stock as number | null) ?? 0,
			initial_stock: (row.initial_stock as number | null) ?? 0,
			pickup_start: String(row.pickup_start),
			pickup_end: String(row.pickup_end),
			is_active: (row.is_active as boolean | null) ?? false,
			includes: (row.includes as string | null) ?? null,
			allergens: (row.allergens as string | null) ?? null,
			rating: numOrNull(row.rating) ?? 0,
			review_count: (row.review_count as number | null) ?? 0,
			created_at: String(row.created_at ?? ""),
			updated_at: "",
		},
		business,
		location,
		categories,
	};
}

function embeddedCategories(rows: unknown): EmbeddedCategory[] {
	if (!Array.isArray(rows)) return [];
	const result: EmbeddedCategory[] = [];
	for (const entry of rows) {
		const item = entry as Row;
		const cat = item.categories as Row | undefined;
		if (cat) {
			result.push({
				id: String(cat.id),
				name: String(cat.name),
				slug: (cat.slug as string | null) ?? null,
				emoji: (cat.emoji as string | null) ?? null,
				image_url: (cat.image_url as string | null) ?? null,
				active: (cat.active as boolean | null) ?? true,
			});
		}
	}
	return result;
}

function numOrNull(value: unknown): number | null {
	if (typeof value === "number") return value;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		return Number.isNaN(n) ? null : n;
	}
	return null;
}
