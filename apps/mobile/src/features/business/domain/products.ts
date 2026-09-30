import { strings } from "@/src/core/i18n/strings";
import type { OfferDetail } from "@/src/features/offers/domain/offer";

/**
 * Business catalog view model (pure logic — ported from Rolé v1
 * `filteredBusinessOffersProvider` in Flutter). Filtering/sorting is done
 * client-side over the fetched business offers.
 */

export const PRODUCT_SORTS = [
	"newest",
	"nameAZ",
	"nameZA",
	"priceLow",
	"priceHigh",
	"stockLow",
] as const;

export type ProductsSort = (typeof PRODUCT_SORTS)[number];

/** Server-side ordering equivalent of a ProductsSort (base columns only). */
export interface ProductServerOrder {
	orderBy: "created_at" | "title" | "discounted_price" | "stock";
	ascending: boolean;
}

/** Maps a catalog sort to PostgREST `order()` params (no client re-sort over pages). */
export function productsSortToOrder(sort: ProductsSort): ProductServerOrder {
	switch (sort) {
		case "newest":
			return { orderBy: "created_at", ascending: false };
		case "nameAZ":
			return { orderBy: "title", ascending: true };
		case "nameZA":
			return { orderBy: "title", ascending: false };
		case "priceLow":
			return { orderBy: "discounted_price", ascending: true };
		case "priceHigh":
			return { orderBy: "discounted_price", ascending: false };
		case "stockLow":
			return { orderBy: "stock", ascending: true };
	}
}

export interface ProductListFilters {
	branchId: string | null;
	searchQuery: string;
	categoryId: string | null;
	sort: ProductsSort;
}

export const defaultProductListFilters: ProductListFilters = {
	branchId: null,
	searchQuery: "",
	categoryId: null,
	sort: "newest",
};

/** Applies branch + search + category filters and the selected sort. */
export function filterAndSortProducts(
	offers: OfferDetail[],
	filters: ProductListFilters,
): OfferDetail[] {
	const query = filters.searchQuery.trim().toLowerCase();
	return offers
		.filter((o) => {
			if (
				filters.branchId &&
				o.offer.business_location_id !== filters.branchId
			) {
				return false;
			}
			if (query && !o.offer.title.toLowerCase().includes(query)) return false;
			if (
				filters.categoryId &&
				!o.categories.some((c) => c.id === filters.categoryId)
			) {
				return false;
			}
			return true;
		})
		.sort(bySort(filters.sort));
}

/** Headline metrics shown above the catalog. */
export interface ProductStats {
	activeCount: number;
	soldToday: number;
	availableCount: number;
}

export function productStats(offers: OfferDetail[]): ProductStats {
	let activeCount = 0;
	let soldToday = 0;
	let availableCount = 0;
	for (const o of offers) {
		const offer = o.offer;
		if (offer.is_active) activeCount += 1;
		soldToday += Math.max(
			0,
			(offer.initial_stock ?? offer.stock) - offer.stock,
		);
		availableCount += offer.stock;
	}
	return { activeCount, soldToday, availableCount };
}

function bySort(
	sort: ProductsSort,
): (a: OfferDetail, b: OfferDetail) => number {
	switch (sort) {
		case "newest":
			return (a, b) => ts(b.offer.created_at) - ts(a.offer.created_at);
		case "nameAZ":
			return (a, b) => a.offer.title.localeCompare(b.offer.title);
		case "nameZA":
			return (a, b) => b.offer.title.localeCompare(a.offer.title);
		case "priceLow":
			return (a, b) => a.offer.discounted_price - b.offer.discounted_price;
		case "priceHigh":
			return (a, b) => b.offer.discounted_price - a.offer.discounted_price;
		case "stockLow":
			return (a, b) => a.offer.stock - b.offer.stock;
	}
}

function ts(iso: string): number {
	const time = Date.parse(iso);
	return Number.isNaN(time) ? 0 : time;
}

/** Lead time of the default pickup window (an hour into the future). */
export const PICKUP_DEFAULT_LEAD_MS = 60 * 60 * 1000;
/** Length of the default pickup window. */
export const PICKUP_DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Default pickup window for a brand-new offer, computed from `now`: the next
 * whole hour at least an hour away, open for two hours. It can never land in
 * the past, which a clock-anchored default (today at 18:00-20:00) did whenever
 * the owner published in the evening.
 */
export function defaultPickupWindow(now: Date = new Date()): {
	start: Date;
	end: Date;
} {
	const start = new Date(now.getTime() + PICKUP_DEFAULT_LEAD_MS);
	// Truncate to the hour: the lead time keeps it strictly in the future.
	start.setMinutes(0, 0, 0);
	return {
		start,
		end: new Date(start.getTime() + PICKUP_DEFAULT_DURATION_MS),
	};
}

/**
 * Publishability of a pickup window. `end > start` is necessary but not
 * sufficient: a window that already closed produces an offer no consumer can
 * ever reserve, so it is rejected too.
 */
export function validatePickupWindow(
	start: Date,
	end: Date,
	now: Date = new Date(),
): string | null {
	if (end.getTime() <= start.getTime()) {
		return strings.business.invalidPickupWindow;
	}
	if (end.getTime() <= now.getTime()) {
		return strings.business.pickupWindowInPast;
	}
	return null;
}
