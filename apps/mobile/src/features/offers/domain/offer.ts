import type {
	Business,
	BusinessLocation,
	Category,
	Offer,
} from "@0xc1x/role-commons";

/**
 * Offer read models for the mobile app.
 *
 * Raw rows (`Offer`, `Category`, `Business`, `BusinessLocation`) come
 * from @0xc1x/role-commons (SSOT per docs/contracts.md) — nothing is
 * duplicated. Here we only define the *projections* PostgREST returns
 * for embedded relations and the aggregated view models that are
 * mobile-specific.
 */

/** Embedded `businesses` relation (subset returned by offer selects). */
export type EmbeddedBusiness = Pick<
	Business,
	"id" | "name" | "type" | "image" | "rating" | "review_count"
>;

/** Embedded `business_locations` relation (subset returned by offer selects). */
export type EmbeddedLocation = Pick<
	BusinessLocation,
	"id" | "name" | "address" | "latitude" | "longitude" | "zone"
>;

/** Embedded `offer_categories → categories` relation. */
export type EmbeddedCategory = Pick<
	Category,
	"id" | "name" | "emoji" | "image_url" | "active"
> & { slug: string | null };

/** Offer composed with its business, pickup location and categories. */
export interface OfferDetail {
	offer: Offer;
	business: EmbeddedBusiness;
	location: EmbeddedLocation | null;
	categories: EmbeddedCategory[];
}

/** Aggregated business summary (deduped from active offers). */
export interface BusinessSummary {
	id: string;
	name: string;
	type: string;
	imageUrl: string | null;
	latitude: number | null;
	longitude: number | null;
	rating: number;
	address: string;
	businessLocationId: string | null;
	zone: string | null;
	reviewCount: number;
	activeDealsCount: number;
	distanceKm: number | null;
}

/** Category + active-offer count for the home category grid. */
export interface CategoryStat {
	id: string;
	name: string;
	count: number;
	emoji: string;
	imageUrl: string;
}

/** Top zones by active offers. */
export interface AreaStat {
	name: string;
	deals: number;
}

// ─── Derived helpers (pure) ───────────────────────────────────────────

export function discountPercentage(
	offer: Pick<Offer, "original_price" | "discounted_price">,
): number {
	if (offer.original_price <= 0) return 0;
	return (
		((offer.original_price - offer.discounted_price) / offer.original_price) *
		100
	);
}

export function categoryLabel(categories: EmbeddedCategory[]): string {
	return categories.map((c) => c.name).join(", ");
}

export function isOfferAvailable(
	offer: OfferDetail,
	now: Date = new Date(),
): boolean {
	return (
		offer.offer.is_active &&
		offer.offer.stock > 0 &&
		now < new Date(offer.offer.pickup_end)
	);
}

export function isOfferOutOfStock(offer: OfferDetail): boolean {
	return offer.offer.stock <= 0;
}

export function isOfferExpired(
	offer: OfferDetail,
	now: Date = new Date(),
): boolean {
	return now > new Date(offer.offer.pickup_end);
}

/** Haversine distance in km between two coordinates. */
export function haversineKm(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return 6371 * c;
}
