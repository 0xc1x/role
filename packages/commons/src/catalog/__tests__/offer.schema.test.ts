import { describe, expect, it } from "bun:test";
import {
	ListOffersQuerySchema,
	ListZonesQuerySchema,
} from "../schemas/offer-query.schema";
import {
	CreateOfferSchema,
	OfferWithBusinessSchema,
	PopularZoneSchema,
	PopularZonesResponseSchema,
} from "../schemas/offer.schema";

const uuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const ts = "2026-01-01T12:00:00.000Z";

describe("CreateOfferSchema", () => {
	const valid = {
		business_id: uuid,
		business_location_id: uuid,
		title: "Bolsa sorpresa",
		original_price: 10,
		discounted_price: 5,
		stock: 3,
		initial_stock: 3,
		pickup_start: ts,
		pickup_end: "2026-01-01T18:00:00.000Z",
		category_ids: [uuid],
	};

	it("accepts valid offer", () => {
		expect(CreateOfferSchema.safeParse(valid).success).toBe(true);
	});

	it("rejects discounted_price greater than original", () => {
		expect(
			CreateOfferSchema.safeParse({ ...valid, discounted_price: 15 }).success,
		).toBe(false);
	});

	it("rejects negative stock", () => {
		expect(CreateOfferSchema.safeParse({ ...valid, stock: -1 }).success).toBe(
			false,
		);
	});
});

describe("ListOffersQuerySchema", () => {
	it("caps limit at 100", () => {
		expect(ListOffersQuerySchema.safeParse({ limit: 200 }).success).toBe(false);
	});

	// ─── active_offers_near (ADR-0008) ────────────────────────────────────

	it("sort default es pickup_end, no created_at", () => {
		// The default mirrors `active_offers_near`'s pickup_end branch: soonest
		// expiry first. It replaced a hardcoded `pickup_end desc` (latest expiry
		// first), so this is the assertion that the ordering really flipped.
		expect(ListOffersQuerySchema.parse({}).sort).toBe("pickup_end");
	});

	it("sort acepta los tres valores de la RPC y rechaza el resto", () => {
		for (const sort of ["created_at", "distance", "pickup_end"]) {
			expect(ListOffersQuerySchema.parse({ sort }).sort).toBe(sort);
		}
		expect(ListOffersQuerySchema.safeParse({ sort: "price" }).success).toBe(
			false,
		);
		expect(ListOffersQuerySchema.safeParse({ sort: "" }).success).toBe(false);
	});

	it("coerce max_price y expiring_within_hours desde query strings", () => {
		const parsed = ListOffersQuerySchema.parse({
			max_price: "5.5",
			expiring_within_hours: "3",
		});
		expect(parsed.max_price).toBe(5.5);
		expect(parsed.expiring_within_hours).toBe(3);

		expect(ListOffersQuerySchema.safeParse({ max_price: "0" }).success).toBe(
			false,
		);
		expect(ListOffersQuerySchema.safeParse({ max_price: "-1" }).success).toBe(
			false,
		);
		expect(
			ListOffersQuerySchema.safeParse({ expiring_within_hours: "1.5" }).success,
		).toBe(false);
		expect(
			ListOffersQuerySchema.safeParse({ expiring_within_hours: "0" }).success,
		).toBe(false);
		expect(
			ListOffersQuerySchema.safeParse({ expiring_within_hours: "721" }).success,
		).toBe(false);
	});

	it("search recorta y rechaza vacío o demasiado largo", () => {
		expect(
			ListOffersQuerySchema.parse({ search: "  panadería  " }).search,
		).toBe("panadería");
		// A blank term is a filter nobody asked for: it would have to be read as
		// "match everything", and `?search=` is what an empty search box sends.
		expect(ListOffersQuerySchema.safeParse({ search: "   " }).success).toBe(
			false,
		);
		expect(
			ListOffersQuerySchema.safeParse({ search: "a".repeat(121) }).success,
		).toBe(false);
	});

	it("los filtros nuevos no aparecen si no se piden", () => {
		const parsed = ListOffersQuerySchema.parse({});
		expect(parsed.search).toBeUndefined();
		expect(parsed.max_price).toBeUndefined();
		expect(parsed.expiring_within_hours).toBeUndefined();
	});
});

describe("OfferWithBusinessSchema", () => {
	const base = {
		id: uuid,
		business_id: uuid,
		business_location_id: uuid,
		title: "Bolsa sorpresa",
		description: null,
		image: null,
		category_ids: [],
		original_price: 10,
		discounted_price: 5,
		discount_percentage: 50,
		stock: 3,
		initial_stock: 3,
		pickup_start: ts,
		pickup_end: "2026-01-01T18:00:00.000Z",
		is_active: true,
		includes: null,
		allergens: null,
		rating: 0,
		review_count: 0,
		created_at: ts,
		updated_at: ts,
		categories: [],
		business: {
			id: uuid,
			name: "Panadería Central",
			slug: "panaderia-central",
			image: null,
			rating: 4.5,
		},
		location: {
			id: uuid,
			name: "Matriz",
			address: "Calle 123",
			latitude: -33.45,
			longitude: -70.66,
			zone: null,
		},
	};

	it("lleva distance_km cuando la consulta trae punto", () => {
		const parsed = OfferWithBusinessSchema.parse({
			...base,
			distance_km: 1.25,
		});
		expect(parsed.distance_km).toBe(1.25);
	});

	it("distance_km es null, no ausente, sin punto de búsqueda", () => {
		expect(
			OfferWithBusinessSchema.parse({ ...base, distance_km: null }).distance_km,
		).toBeNull();
	});

	it("sigue siendo válido sin distance_km", () => {
		// The projections with nothing to measure from (detail, hero,
		// saved offers) send null, and a consumer building this shape by hand
		// is not forced to invent a distance.
		expect(OfferWithBusinessSchema.safeParse(base).success).toBe(true);
	});
});

// ─── `GET /offers/zones` — espejo de `public.popular_zones` (ADR-0008) ─────

describe("ListZonesQuerySchema", () => {
	it("default limit 5, como p_limit", () => {
		expect(ListZonesQuerySchema.parse({}).limit).toBe(5);
	});

	it("radius_km NO tiene default, como p_radius_km default null", () => {
		// A defaulted radius would turn a location-less request into a 10 km
		// search — the exact bug the RPC's `default null` avoids.
		const parsed = ListZonesQuerySchema.parse({});
		expect(parsed.radius_km).toBeUndefined();
		expect(parsed.lat).toBeUndefined();
		expect(parsed.lng).toBeUndefined();
	});

	it("coercea query strings y acepta limit 0 y negativos", () => {
		// `limit greatest(p_limit, 1)` clamps 0 and below to one row, so
		// rejecting them here would make the RPC's clamp unreachable.
		const parsed = ListZonesQuerySchema.parse({
			lat: "-33.45",
			lng: "-70.66",
			radius_km: "5",
			limit: "0",
		});
		expect(parsed).toEqual({
			lat: -33.45,
			lng: -70.66,
			radius_km: 5,
			limit: 0,
		});
		expect(ListZonesQuerySchema.parse({ limit: -5 }).limit).toBe(-5);
	});

	it("rechaza limit no entero y radius no positivo", () => {
		expect(ListZonesQuerySchema.safeParse({ limit: "1.5" }).success).toBe(
			false,
		);
		expect(ListZonesQuerySchema.safeParse({ radius_km: 0 }).success).toBe(
			false,
		);
		expect(ListZonesQuerySchema.safeParse({ radius_km: -1 }).success).toBe(
			false,
		);
	});

	it("rechaza coordenadas fuera de rango y radius > 100 km", () => {
		expect(ListZonesQuerySchema.safeParse({ lat: 91 }).success).toBe(false);
		expect(ListZonesQuerySchema.safeParse({ lng: -181 }).success).toBe(false);
		expect(ListZonesQuerySchema.safeParse({ radius_km: 101 }).success).toBe(
			false,
		);
	});

	it("no pagina: no hay page ni meta en el contrato", () => {
		// A `page` here would be silently ignored by the query, which is worse
		// than not offering it.
		const parsed = ListZonesQuerySchema.parse({ page: "3" });
		expect(parsed).not.toHaveProperty("page");
	});
});

describe("PopularZoneSchema", () => {
	it("acepta el conteo como número y rechaza null/vacío en zone", () => {
		expect(PopularZoneSchema.parse({ zone: "centro", deals: 12 })).toEqual({
			zone: "centro",
			deals: 12,
		});
		// The SQL already filtered `zone is not null and zone <> ''`, so a blank
		// zone is not a zone with zero deals.
		expect(PopularZoneSchema.safeParse({ zone: "", deals: 3 }).success).toBe(
			false,
		);
		expect(PopularZoneSchema.safeParse({ zone: null, deals: 3 }).success).toBe(
			false,
		);
	});

	it("rechaza deals no entero o negativo", () => {
		expect(
			PopularZoneSchema.safeParse({ zone: "centro", deals: 1.5 }).success,
		).toBe(false);
		expect(
			PopularZoneSchema.safeParse({ zone: "centro", deals: -1 }).success,
		).toBe(false);
	});

	it("la respuesta es un array, no un PaginatedData", () => {
		const rows = [
			{ zone: "centro", deals: 12 },
			{ zone: "providencia", deals: 4 },
		];
		expect(PopularZonesResponseSchema.parse(rows)).toEqual(rows);
		// No `meta`: la RPC es un top-N y nunca devuelve un total.
		expect(PopularZonesResponseSchema.safeParse({ data: rows }).success).toBe(
			false,
		);
	});
});
