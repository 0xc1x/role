import { describe, expect, it } from "bun:test";

import {
	discountPercentage,
	filterByDistance,
	isOfferAvailable,
	isOfferExpired,
	isOfferOutOfStock,
	haversineKm,
} from "@/features/offers/domain/offer";
import type { OfferDetail } from "@/features/offers/domain/offer";

const now = new Date("2025-01-15T12:00:00Z");

function makeOffer(overrides: Partial<OfferDetail["offer"]> = {}): OfferDetail {
	return {
		offer: {
			id: "o1",
			business_id: "b1",
			business_location_id: "l1",
			title: "Pan del día",
			description: null,
			image: null,
			category_ids: [],
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
		location: {
			id: "l1",
			name: "Sucursal",
			address: "Calle 1",
			latitude: 19.4,
			longitude: -99.1,
			zone: "Centro",
		},
		categories: [],
	};
}

describe("discountPercentage", () => {
	it("computes the discount percent correctly", () => {
		expect(
			discountPercentage({ original_price: 100, discounted_price: 30 }),
		).toBe(70);
	});

	it("returns 0 when original price is missing", () => {
		expect(
			discountPercentage({ original_price: 0, discounted_price: 10 }),
		).toBe(0);
	});
});

describe("offer availability", () => {
	it("is available when active, in stock and before pickup_end", () => {
		expect(isOfferAvailable(makeOffer(), now)).toBe(true);
	});

	it("is unavailable when inactive", () => {
		expect(isOfferAvailable(makeOffer({ is_active: false }), now)).toBe(false);
	});

	it("is out of stock with zero stock", () => {
		expect(isOfferOutOfStock(makeOffer({ stock: 0 }))).toBe(true);
	});

	it("is expired after pickup_end", () => {
		expect(
			isOfferExpired(makeOffer({ pickup_end: "2025-01-14T20:00:00Z" }), now),
		).toBe(true);
	});
});

describe("haversineKm", () => {
	it("returns ~0 for the same point", () => {
		expect(haversineKm(19.4, -99.1, 19.4, -99.1)).toBeLessThan(0.001);
	});

	it("computes a plausible distance between CDMX points", () => {
		const km = haversineKm(19.4326, -99.1332, 19.4, -99.1);
		expect(km).toBeGreaterThan(3);
		expect(km).toBeLessThan(6);
	});
});

describe("filterByDistance", () => {
	const user = { lat: 19.4, lng: -99.1 };

	function offerAt(id: string, lat: number, lng: number): OfferDetail {
		const base = makeOffer({ id });
		return {
			...base,
			location: { ...base.location!, id, latitude: lat, longitude: lng },
		};
	}

	it("keeps offers inside the radius and drops the rest", () => {
		const near = offerAt("near", 19.41, -99.1); // ~1.1 km
		const far = offerAt("far", 19.6, -99.1); // ~22 km
		const result = filterByDistance([near, far], user.lat, user.lng, 5);
		expect(result.map((o) => o.offer.id)).toEqual(["near"]);
	});

	it("includes offers exactly at the distance limit", () => {
		const same = offerAt("same", user.lat, user.lng);
		expect(filterByDistance([same], user.lat, user.lng, 0)).toHaveLength(1);
	});

	it("drops offers without pickup location", () => {
		const base = makeOffer({ id: "noloc" });
		const withoutLocation: OfferDetail = { ...base, location: null };
		expect(
			filterByDistance([withoutLocation], user.lat, user.lng, 50),
		).toHaveLength(0);
	});
});
