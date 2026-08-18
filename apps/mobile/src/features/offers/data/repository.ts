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
import { haversineKm } from "../domain/offer";

/**
 * The embedded PostgREST select that composes an offer with its
 * business, pickup location and categories.
 */
const OFFER_SELECT = `
  id, business_id, business_location_id, title, description, image,
  original_price, discounted_price, stock, initial_stock,
  pickup_start, pickup_end, is_active, includes, allergens, rating, review_count,
  created_at,
  businesses:business_id (
    id, name, type, image, rating, review_count
  ),
  business_locations:business_locations!offers_business_location_id_fkey (
    id, name, address, latitude, longitude, zone
  ),
  offer_categories (
    categories:categories!offer_categories_category_id_fkey (
      id, name, slug, emoji, image_url, active
    )
  )
`;

/** Same select forcing an INNER join on offer_categories (used when
 * filtering by category — PostgREST only filters parents with !inner). */
const OFFER_SELECT_INNER_CATEGORIES =
	"id, business_id, business_location_id, title, description, image, " +
	"original_price, discounted_price, stock, initial_stock, " +
	"pickup_start, pickup_end, is_active, includes, allergens, rating, review_count, created_at, " +
	"businesses:business_id(id, name, type, image, rating, review_count), " +
	"business_locations:business_locations!offers_business_location_id_fkey(id, name, address, latitude, longitude, zone), " +
	"offer_categories!inner(categories:categories!offer_categories_category_id_fkey(id, name, slug, emoji, image_url, active))";

export const expiringSoonWindowHours = 3;

type Row = Record<string, unknown>;

export const offersRepository = {
	async getPopularOffers(limit = 10): Promise<OfferDetail[]> {
		const { data, error } = await activeQuery(null).limit(limit);
		if (error) throw toAppError(error, "Error al cargar ofertas populares");
		return toRows(data).map(mapOfferDetail);
	},

	async getPopularOffersFiltered(
		category: string | null,
		limit = 10,
	): Promise<OfferDetail[]> {
		const { data, error } = await activeQuery(category)
			.order("created_at", { ascending: false })
			.limit(limit);
		if (error) throw toAppError(error, "Error al cargar ofertas populares");
		return toRows(data).map(mapOfferDetail);
	},

	async getExpiringSoonOffers(
		radiusParams?: { lat: number; lng: number; radiusKm?: number },
		limit = 5,
	): Promise<OfferDetail[]> {
		try {
			const all = await fetchActive();
			const now = new Date();
			const cutoff = new Date(
				now.getTime() + expiringSoonWindowHours * 3600_000,
			);
			let filtered = all.filter((o) => {
				const end = new Date(o.offer.pickup_end);
				return end > now && end < cutoff;
			});
			if (radiusParams) {
				filtered = filterByDistance(
					filtered,
					radiusParams.lat,
					radiusParams.lng,
					radiusParams.radiusKm ?? 5,
				);
			}
			filtered.sort(
				(a, b) =>
					new Date(a.offer.pickup_end).getTime() -
					new Date(b.offer.pickup_end).getTime(),
			);
			return filtered.slice(0, limit);
		} catch (e) {
			throw toAppError(e, "Error al cargar ofertas por expirar");
		}
	},

	async getRecentOffers(
		radiusParams?: { lat: number; lng: number; radiusKm?: number },
		limit = 5,
	): Promise<OfferDetail[]> {
		const all = await fetchActive();
		let filtered = all;
		if (radiusParams) {
			filtered = filterByDistance(
				all,
				radiusParams.lat,
				radiusParams.lng,
				radiusParams.radiusKm ?? 5,
			);
		}
		filtered.sort((a, b) => {
			const da = a.offer.created_at
				? new Date(a.offer.created_at).getTime()
				: 0;
			const db = b.offer.created_at
				? new Date(b.offer.created_at).getTime()
				: 0;
			return db - da;
		});
		return filtered.slice(0, limit);
	},

	async getNearbyOffers(params: {
		lat: number;
		lng: number;
		radiusKm?: number;
		limit?: number;
		category?: string | null;
	}): Promise<OfferDetail[]> {
		const { lat, lng, radiusKm = 5, limit = 20, category = null } = params;
		const all = await fetchActive({ category });
		return all
			.filter((o) => {
				if (o.location == null) return false;
				return (
					haversineKm(lat, lng, o.location.latitude, o.location.longitude) <=
					radiusKm
				);
			})
			.sort((a, b) => distanceTo(a, lat, lng) - distanceTo(b, lat, lng))
			.slice(0, limit);
	},

	async getFilteredOffers(params: {
		lat?: number;
		lng?: number;
		category?: string | null;
		maxPrice?: number | null;
		maxDistanceKm?: number | null;
		searchQuery?: string | null;
	}): Promise<OfferDetail[]> {
		const {
			category = null,
			maxPrice = null,
			maxDistanceKm = null,
			searchQuery = null,
		} = params;
		let q = activeQuery(category);
		if (maxPrice != null) q = q.lte("discounted_price", maxPrice);
		if (searchQuery != null && searchQuery.length > 0) {
			q = q.or(
				`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`,
			);
		}
		const { data, error } = await q.order("created_at", { ascending: false });
		if (error) throw toAppError(error, "Error al filtrar ofertas");
		let offers = toRows(data).map(mapOfferDetail);

		if (searchQuery != null && searchQuery.length > 0) {
			const needle = searchQuery.toLowerCase();
			offers = offers.filter(
				(o) =>
					o.business.name.toLowerCase().includes(needle) ||
					o.offer.description?.toLowerCase().includes(needle),
			);
		}
		if (maxDistanceKm != null && params.lat != null && params.lng != null) {
			offers = offers.filter((o) => {
				if (o.location == null) return false;
				return (
					haversineKm(
						params.lat!,
						params.lng!,
						o.location.latitude,
						o.location.longitude,
					) <= maxDistanceKm
				);
			});
		}
		return offers;
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
		const [categories, rows] = await Promise.all([
			this.getCategories(),
			supabase
				.from("offers")
				.select("offer_categories(category_id)")
				.eq("is_active", true)
				.gt("stock", 0)
				.gt("pickup_end", new Date().toISOString()),
		]);
		if (rows.error) throw toAppError(rows.error, "Error al cargar categorías");
		const counts = new Map<string, number>();
		for (const row of toRows(rows.data)) {
			const pairs = row.offer_categories as Array<{
				category_id?: string;
			}> | null;
			for (const pair of pairs ?? []) {
				if (pair.category_id)
					counts.set(pair.category_id, (counts.get(pair.category_id) ?? 0) + 1);
			}
		}
		const stats: CategoryStat[] = categories.map((c) => ({
			id: c.id,
			name: c.name,
			count: counts.get(c.id) ?? 0,
			emoji: c.emoji ?? "",
			imageUrl: c.image_url ?? "",
		}));
		stats.sort((a, b) => b.count - a.count);
		return stats;
	},

	async getPopularAreas(): Promise<AreaStat[]> {
		try {
			const { data, error } = await supabase
				.from("offers")
				.select("business_locations!offers_business_location_id_fkey(zone)")
				.eq("is_active", true)
				.gt("stock", 0)
				.gt("pickup_end", new Date().toISOString())
				.limit(5000);
			if (error) return [];
			const counts = new Map<string, number>();
			for (const row of toRows(data)) {
				const loc = row.business_locations as Record<string, unknown> | null;
				const zone = loc?.zone as string | null;
				if (zone && zone.length > 0)
					counts.set(zone, (counts.get(zone) ?? 0) + 1);
			}
			return [...counts.entries()]
				.map(([name, deals]) => ({ name, deals }))
				.sort((a, b) => b.deals - a.deals)
				.slice(0, 5);
		} catch {
			return [];
		}
	},

	async getNearbyBusinesses(
		radiusParams?: { lat: number; lng: number; radiusKm?: number },
		limit = 5,
	): Promise<BusinessSummary[]> {
		const all = await fetchActive();
		const byId = new Map<string, BusinessSummary>();
		for (const offer of all) {
			const b = offer.business;
			const distance =
				offer.location != null && radiusParams
					? haversineKm(
							radiusParams.lat,
							radiusParams.lng,
							offer.location.latitude,
							offer.location.longitude,
						)
					: null;
			if (
				radiusParams &&
				(distance == null || distance > (radiusParams.radiusKm ?? 5))
			)
				continue;
			const current = byId.get(b.id) ?? newBusinessSummary(offer);
			if (
				distance != null &&
				(current.distanceKm == null || distance < current.distanceKm)
			) {
				current.distanceKm = distance;
			}
			current.activeDealsCount += 1;
			byId.set(b.id, current);
		}
		return [...byId.values()]
			.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
			.slice(0, limit);
	},

	async getAllBusinesses(params: {
		lat?: number | null;
		lng?: number | null;
		radiusKm?: number;
		searchQuery?: string | null;
		type?: string | null;
		limit?: number;
	}): Promise<BusinessSummary[]> {
		const {
			lat = null,
			lng = null,
			radiusKm = 10,
			searchQuery = null,
			type = null,
			limit = 50,
		} = params;
		const all = await fetchActive();
		const byId = new Map<string, BusinessSummary>();
		for (const offer of all) {
			const b = offer.business;
			let distance: number | null = null;
			if (lat != null && lng != null && offer.location != null) {
				distance = haversineKm(
					lat,
					lng,
					offer.location.latitude,
					offer.location.longitude,
				);
				if (distance > radiusKm) continue;
			}
			if (type != null && b.type.toLowerCase() !== type.toLowerCase()) continue;
			if (
				searchQuery != null &&
				searchQuery.length > 0 &&
				!b.name.toLowerCase().includes(searchQuery.toLowerCase())
			) {
				continue;
			}
			const current = byId.get(b.id) ?? newBusinessSummary(offer);
			if (
				distance != null &&
				(current.distanceKm == null || distance < current.distanceKm)
			) {
				current.distanceKm = distance;
			}
			current.activeDealsCount += 1;
			byId.set(b.id, current);
		}
		return [...byId.values()]
			.sort((a, b) => b.activeDealsCount - a.activeDealsCount)
			.slice(0, limit);
	},

	/** Full active offers (client-side filtering helpers). */
	async getAllActiveOffers(category?: string | null): Promise<OfferDetail[]> {
		return fetchActive({ category });
	},
};

function activeQuery(category: string | null) {
	const hasCategory = category != null && category.length > 0;
	let q = supabase
		.from("offers")
		.select(hasCategory ? OFFER_SELECT_INNER_CATEGORIES : OFFER_SELECT)
		.eq("is_active", true)
		.gt("stock", 0)
		.gt("pickup_end", new Date().toISOString());
	if (hasCategory) q = q.eq("offer_categories.category_id", category);
	return q;
}

async function fetchActive(options?: {
	category?: string | null;
	limit?: number;
}): Promise<OfferDetail[]> {
	let q = activeQuery(options?.category ?? null);
	if (options?.limit != null) q = q.limit(options.limit);
	const { data, error } = await q.order("created_at", { ascending: false });
	if (error) throw toAppError(error, "Error al cargar ofertas");
	return toRows(data).map(mapOfferDetail);
}

function newBusinessSummary(offer: OfferDetail): BusinessSummary {
	return {
		id: offer.business.id,
		name: offer.business.name,
		type: offer.business.type,
		imageUrl: offer.business.image,
		latitude: offer.location?.latitude ?? null,
		longitude: offer.location?.longitude ?? null,
		rating: offer.business.rating ?? 0,
		address: offer.location?.address ?? "",
		businessLocationId: offer.offer.business_location_id,
		zone: offer.location?.zone ?? null,
		reviewCount: offer.business.review_count ?? 0,
		activeDealsCount: 0,
		distanceKm: null,
	};
}

function filterByDistance(
	offers: OfferDetail[],
	lat: number,
	lng: number,
	radiusKm: number,
): OfferDetail[] {
	return offers.filter((o) => {
		if (o.location == null) return false;
		return (
			haversineKm(lat, lng, o.location.latitude, o.location.longitude) <=
			radiusKm
		);
	});
}

function distanceTo(offer: OfferDetail, lat: number, lng: number): number {
	if (offer.location == null) return Infinity;
	return haversineKm(
		lat,
		lng,
		offer.location.latitude,
		offer.location.longitude,
	);
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
