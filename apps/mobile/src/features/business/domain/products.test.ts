import { describe, expect, it } from "vitest";

import type { OfferDetail } from "@/features/offers/domain/offer";
import {
	filterAndSortProducts,
	productStats,
	type ProductListFilters,
} from "@/features/business/domain/products";

function makeOffer(
	overrides: Partial<OfferDetail["offer"]> &
		Pick<Partial<OfferDetail>, "categories" | "location"> = {},
): OfferDetail {
	return {
		offer: {
			id: "o1",
			business_id: "b1",
			business_location_id: "l1",
			title: "Pan del día",
			description: null,
			image: null,
			category_ids: ["c1"],
			original_price: 100,
			discounted_price: 30,
			discount_percentage: null,
			stock: 5,
			initial_stock: 10,
			pickup_start: "2025-01-15T17:00:00Z",
			pickup_end: "2025-01-15T20:00:00Z",
			is_active: true,
			includes: null,
			allergens: null,
			rating: 4.5,
			review_count: 3,
			created_at: "2025-01-14T10:00:00Z",
			updated_at: "2025-01-14T10:00:00Z",
			...overrides,
		},
		business: {
			id: "b1",
			name: "Panadería",
			type: "bakery",
			image: null,
			rating: 4.5,
			review_count: 3,
		},
		location: null,
		categories:
			overrides.categories ??
			[{ id: "c1", name: "Pan", slug: "pan", emoji: "🍞", image_url: null, active: true }],
	};
}

const baseFilters: ProductListFilters = {
	branchId: null,
	searchQuery: "",
	categoryId: null,
	sort: "newest",
};

describe("filterAndSortProducts", () => {
	it("returns all offers with default filters", () => {
		const offers = [makeOffer({ id: "a" }), makeOffer({ id: "b" })];
		expect(filterAndSortProducts(offers, baseFilters)).toHaveLength(2);
	});

	it("filters by branch (business_location_id)", () => {
		const offers = [
			makeOffer({ id: "a", business_location_id: "l1" }),
			makeOffer({ id: "b", business_location_id: "l2" }),
		];
		const result = filterAndSortProducts(offers, { ...baseFilters, branchId: "l2" });
		expect(result.map((o) => o.offer.id)).toEqual(["b"]);
	});

	it("filters by title search, case-insensitive and trimmed", () => {
		const offers = [
			makeOffer({ id: "a", title: "Pack Sorpresa Pan" }),
			makeOffer({ id: "b", title: "Croissant" }),
		];
		const result = filterAndSortProducts(offers, {
			...baseFilters,
			searchQuery: "  sorpresa  ",
		});
		expect(result.map((o) => o.offer.id)).toEqual(["a"]);
	});

	it("filters by category membership", () => {
		const offers = [
			makeOffer({ id: "a" }),
			makeOffer({ id: "b", categories: [{ id: "c2", name: "Bebidas", slug: "bebidas", emoji: null, image_url: null, active: true }] }),
		];
		const result = filterAndSortProducts(offers, { ...baseFilters, categoryId: "c2" });
		expect(result.map((o) => o.offer.id)).toEqual(["b"]);
	});

	it("sorts newest first (created_at desc)", () => {
		const offers = [
			makeOffer({ id: "old", created_at: "2025-01-10T00:00:00Z" }),
			makeOffer({ id: "new", created_at: "2025-01-20T00:00:00Z" }),
		];
		const result = filterAndSortProducts(offers, { ...baseFilters, sort: "newest" });
		expect(result[0]!.offer.id).toBe("new");
	});

	it("sorts by price low/high", () => {
		const offers = [
			makeOffer({ id: "a", discounted_price: 50 }),
			makeOffer({ id: "b", discounted_price: 20 }),
		];
		const low = filterAndSortProducts(offers, { ...baseFilters, sort: "priceLow" });
		expect(low.map((o) => o.offer.id)).toEqual(["b", "a"]);
		const high = filterAndSortProducts(offers, { ...baseFilters, sort: "priceHigh" });
		expect(high.map((o) => o.offer.id)).toEqual(["a", "b"]);
	});

	it("sorts by name A-Z and Z-A", () => {
		const offers = [
			makeOffer({ id: "a", title: "Zurra" }),
			makeOffer({ id: "b", title: "Pan" }),
		];
		const az = filterAndSortProducts(offers, { ...baseFilters, sort: "nameAZ" });
		expect(az.map((o) => o.offer.id)).toEqual(["b", "a"]);
		const za = filterAndSortProducts(offers, { ...baseFilters, sort: "nameZA" });
		expect(za.map((o) => o.offer.id)).toEqual(["a", "b"]);
	});

	it("sorts by lowest stock", () => {
		const offers = [
			makeOffer({ id: "a", stock: 8 }),
			makeOffer({ id: "b", stock: 2 }),
		];
		const result = filterAndSortProducts(offers, { ...baseFilters, sort: "stockLow" });
		expect(result.map((o) => o.offer.id)).toEqual(["b", "a"]);
	});
});

describe("productStats", () => {
	it("computes active, sold today and available counts", () => {
		const offers = [
			makeOffer({ id: "a", is_active: true, initial_stock: 10, stock: 4 }),
			makeOffer({ id: "b", is_active: true, initial_stock: 5, stock: 5 }),
			makeOffer({ id: "c", is_active: false, initial_stock: 20, stock: 12 }),
		];
		expect(productStats(offers)).toEqual({
			activeCount: 2,
			soldToday: 14,
			availableCount: 21,
		});
	});

	it("does not count negative sold when initial_stock is missing", () => {
		const offers = [makeOffer({ id: "a", initial_stock: 0, stock: 3 })];
		expect(productStats(offers).soldToday).toBe(0);
	});
});