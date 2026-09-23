import type { Favorite } from "@0xc1x/role-commons";

import { supabase } from "@/src/core/supabase/client";
import { toAppError } from "@/src/core/error/mapper";

import type { EmbeddedCategory } from "@/src/features/offers/domain/offer";

/** A user's favorite offer with its embedded offer projection. */
export interface FavoriteOffer {
	favoriteId: string;
	offerId: string;
	businessName: string;
	address: string;
	zone: string | null;
	categories: EmbeddedCategory[];
	title: string;
	rating: number;
	discountedPrice: number;
	originalPrice: number;
	imageUrl: string | null;
	/** Proyección real de disponibilidad (nunca inventada en la card). */
	stock: number;
	pickupStart: string;
	pickupEnd: string;
	businessId: string;
	isActive: boolean;
	/**
	 * True si la oferta embebida no llegó (eliminada) y los campos de
	 * disponibilidad son relleno neutro: la UI debe ocultarlos.
	 */
	availabilityUnknown: boolean;
}

type Row = Record<string, unknown>;

export const favoritesRepository = {
	async getFavorites(
		userId: string,
		params: { limit?: number; offset?: number } = {},
	): Promise<FavoriteOffer[]> {
		let paged = supabase
			.from("favorites")
			.select(
				`
        id,
        offer_id,
        offers:offer_id (
          id, title, image, original_price, discounted_price, rating,
          stock, pickup_start, pickup_end, is_active, business_id,
          businesses:business_id (name),
          business_locations:business_location_id (address, zone),
          offer_categories (
            categories:categories!offer_categories_category_id_fkey (
              id, name, slug, emoji, image_url, active
            )
          )
        )
        `,
			)
			.eq("user_id", userId)
			.order("created_at", { ascending: false });
		if (params.limit != null) {
			const offset = params.offset ?? 0;
			paged = paged.range(offset, offset + params.limit - 1);
		}
		const { data, error } = await paged;
		if (error) throw toAppError(error, "Error al cargar favoritos");
		return toRows(data).map(mapFavorite);
	},

	async getFavoriteOfferIds(userId: string): Promise<Set<string>> {
		// Unbounded by design: one tiny row (offer_id) per save, naturally
		// bounded by how many offers a user favorites.
		const { data, error } = await supabase
			.from("favorites")
			.select("offer_id")
			.eq("user_id", userId);
		if (error) throw toAppError(error, "Error al cargar favoritos");
		return new Set(toRows(data).map((r) => String(r.offer_id)));
	},

	async addFavorite(userId: string, offerId: string): Promise<string> {
		const { data, error } = await supabase
			.from("favorites")
			.insert({ user_id: userId, offer_id: offerId })
			.select("id")
			.single();
		if (error) throw toAppError(error, "Error al guardar la oferta");
		return String(data.id);
	},

	async removeFavorite(favoriteId: string, userId: string): Promise<void> {
		const { error } = await supabase
			.from("favorites")
			.delete()
			.eq("user_id", userId)
			.eq("id", favoriteId);
		if (error) throw toAppError(error, "Error al quitar de guardados");
	},

	async removeFavoriteByOfferId(
		offerId: string,
		userId: string,
	): Promise<void> {
		const { error } = await supabase
			.from("favorites")
			.delete()
			.eq("user_id", userId)
			.eq("offer_id", offerId);
		if (error) throw toAppError(error, "Error al quitar de guardados");
	},
};

function mapFavorite(row: Row): FavoriteOffer {
	const offer = (row.offers ?? {}) as Row;
	const business = (offer.businesses ?? {}) as Row;
	const location = (offer.business_locations ?? null) as Row | null;
	// Sin fila embebida (oferta eliminada) no hay disponibilidad real.
	const unknown = row.offers == null;

	return {
		favoriteId: String(row.id),
		offerId: String(offer.id ?? row.offer_id ?? ""),
		businessName: String(business.name ?? "Negocio"),
		address: (location?.address as string | null) ?? "",
		zone: (location?.zone as string | null) ?? null,
		categories: mapCategories(offer.offer_categories),
		title: String(offer.title ?? "Oferta"),
		rating: num(offer.rating) ?? 0,
		discountedPrice: num(offer.discounted_price) ?? 0,
		originalPrice: num(offer.original_price) ?? 0,
		imageUrl: (offer.image as string | null) ?? null,
		stock: num(offer.stock) ?? 0,
		pickupStart: (offer.pickup_start as string | null) ?? "",
		pickupEnd: (offer.pickup_end as string | null) ?? "",
		businessId: String(offer.business_id ?? ""),
		isActive: (offer.is_active as boolean | null) ?? false,
		availabilityUnknown: unknown,
	};
}

function mapCategories(rows: unknown): EmbeddedCategory[] {
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

function toRows(data: unknown): Row[] {
	return Array.isArray(data) ? (data as Row[]) : [];
}

function num(value: unknown): number | null {
	if (typeof value === "number") return value;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		return Number.isNaN(n) ? null : n;
	}
	return null;
}

export type { Favorite };
