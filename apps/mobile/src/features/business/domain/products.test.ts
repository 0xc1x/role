import { describe, expect, it } from "bun:test";

import { strings } from "@/src/core/i18n/strings";
import type { OfferDetail } from "@/src/features/offers/domain/offer";
import {
	defaultPickupWindow,
	filterAndSortProducts,
	productStats,
	productsSortToOrder,
	validatePickupWindow,
	type ProductListFilters,
} from "@/src/features/business/domain/products";

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
		categories: overrides.categories ?? [
			{
				id: "c1",
				name: "Pan",
				slug: "pan",
				emoji: "🍞",
				image_url: null,
				active: true,
			},
		],
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
		const result = filterAndSortProducts(offers, {
			...baseFilters,
			branchId: "l2",
		});
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
			makeOffer({
				id: "b",
				categories: [
					{
						id: "c2",
						name: "Bebidas",
						slug: "bebidas",
						emoji: null,
						image_url: null,
						active: true,
					},
				],
			}),
		];
		const result = filterAndSortProducts(offers, {
			...baseFilters,
			categoryId: "c2",
		});
		expect(result.map((o) => o.offer.id)).toEqual(["b"]);
	});

	it("sorts newest first (created_at desc)", () => {
		const offers = [
			makeOffer({ id: "old", created_at: "2025-01-10T00:00:00Z" }),
			makeOffer({ id: "new", created_at: "2025-01-20T00:00:00Z" }),
		];
		const result = filterAndSortProducts(offers, {
			...baseFilters,
			sort: "newest",
		});
		expect(result[0]?.offer.id).toBe("new");
	});

	it("sorts by price low/high", () => {
		const offers = [
			makeOffer({ id: "a", discounted_price: 50 }),
			makeOffer({ id: "b", discounted_price: 20 }),
		];
		const low = filterAndSortProducts(offers, {
			...baseFilters,
			sort: "priceLow",
		});
		expect(low.map((o) => o.offer.id)).toEqual(["b", "a"]);
		const high = filterAndSortProducts(offers, {
			...baseFilters,
			sort: "priceHigh",
		});
		expect(high.map((o) => o.offer.id)).toEqual(["a", "b"]);
	});

	it("sorts by name A-Z and Z-A", () => {
		const offers = [
			makeOffer({ id: "a", title: "Zurra" }),
			makeOffer({ id: "b", title: "Pan" }),
		];
		const az = filterAndSortProducts(offers, {
			...baseFilters,
			sort: "nameAZ",
		});
		expect(az.map((o) => o.offer.id)).toEqual(["b", "a"]);
		const za = filterAndSortProducts(offers, {
			...baseFilters,
			sort: "nameZA",
		});
		expect(za.map((o) => o.offer.id)).toEqual(["a", "b"]);
	});

	it("sorts by lowest stock", () => {
		const offers = [
			makeOffer({ id: "a", stock: 8 }),
			makeOffer({ id: "b", stock: 2 }),
		];
		const result = filterAndSortProducts(offers, {
			...baseFilters,
			sort: "stockLow",
		});
		expect(result.map((o) => o.offer.id)).toEqual(["b", "a"]);
	});
});

describe("productsSortToOrder", () => {
	it("mapea cada sort a order() server-side sobre columnas base", () => {
		expect(productsSortToOrder("newest")).toEqual({
			orderBy: "created_at",
			ascending: false,
		});
		expect(productsSortToOrder("nameAZ")).toEqual({
			orderBy: "title",
			ascending: true,
		});
		expect(productsSortToOrder("nameZA")).toEqual({
			orderBy: "title",
			ascending: false,
		});
		expect(productsSortToOrder("priceLow")).toEqual({
			orderBy: "discounted_price",
			ascending: true,
		});
		expect(productsSortToOrder("priceHigh")).toEqual({
			orderBy: "discounted_price",
			ascending: false,
		});
		expect(productsSortToOrder("stockLow")).toEqual({
			orderBy: "stock",
			ascending: true,
		});
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

describe("defaultPickupWindow", () => {
	// The old default was "today at 18:00-20:00" whatever the clock said, so
	// publishing at 21:00 produced an offer whose window had already closed.
	it("never lands in the past, whatever the hour of publication", () => {
		for (const publishedAt of [
			"2026-09-26T21:00:00",
			"2026-09-26T23:30:00",
			"2026-09-27T00:05:00",
			"2026-09-27T17:59:00",
		]) {
			const now = new Date(publishedAt);
			const { start, end } = defaultPickupWindow(now);

			expect(start.getTime()).toBeGreaterThan(now.getTime());
			expect(end.getTime()).toBeGreaterThan(start.getTime());
			expect(validatePickupWindow(start, end, now)).toBeNull();
		}
	});

	it("keeps the window on the publication day when there is room", () => {
		const { start, end } = defaultPickupWindow(new Date("2026-09-26T10:00:00"));
		expect(start.getHours()).toBe(11);
		expect(end.getTime() - start.getTime()).toBe(2 * 60 * 60 * 1000);
	});
});

describe("validatePickupWindow", () => {
	const now = new Date("2026-09-26T12:00:00");

	it("rejects a window that already closed", () => {
		// end > start holds, yet no consumer could ever reserve it.
		expect(
			validatePickupWindow(
				new Date("2026-09-26T08:00:00"),
				new Date("2026-09-26T10:00:00"),
				now,
			),
		).toBe(strings.business.pickupWindowInPast);
	});

	it("rejects a window that ends exactly now", () => {
		expect(
			validatePickupWindow(
				new Date("2026-09-26T10:00:00"),
				new Date("2026-09-26T12:00:00"),
				now,
			),
		).toBe(strings.business.pickupWindowInPast);
	});

	it("rejects an inverted window", () => {
		expect(
			validatePickupWindow(
				new Date("2026-09-26T20:00:00"),
				new Date("2026-09-26T18:00:00"),
				now,
			),
		).toBe(strings.business.invalidPickupWindow);
	});

	it("accepts a window that is already open but not over", () => {
		expect(
			validatePickupWindow(
				new Date("2026-09-26T11:00:00"),
				new Date("2026-09-26T20:00:00"),
				now,
			),
		).toBeNull();
	});
});
