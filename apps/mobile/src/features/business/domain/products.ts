import type { OfferDetail } from "@/features/offers/domain/offer";

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
		.filter((o) =>
			filters.branchId
				? o.offer.business_location_id === filters.branchId
				: true,
		)
		.filter((o) => !query || o.offer.title.toLowerCase().includes(query))
		.filter((o) =>
			filters.categoryId
				? o.categories.some((c) => c.id === filters.categoryId)
				: true,
		)
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
		if (o.offer.is_active) activeCount += 1;
		soldToday += Math.max(
			0,
			(o.offer.initial_stock ?? o.offer.stock) - o.offer.stock,
		);
		availableCount += o.offer.stock;
	}
	return { activeCount, soldToday, availableCount };
}

function bySort(sort: ProductsSort): (a: OfferDetail, b: OfferDetail) => number {
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