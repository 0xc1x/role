import { describe, expect, it } from "bun:test";
import {
	ListPublicBusinessesQuerySchema,
	PublicBusinessSchema,
	PublicBusinessStorefrontSchema,
} from "../schemas/business-public.schema";

const uuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

const publicBusiness = {
	id: uuid,
	name: "Panadería Sur",
	type: "bakery",
	slug: "panaderia-sur",
	image: null,
	cover_image: null,
	description: null,
	phone: null,
	email: null,
	website: null,
	rating: 4.5,
	review_count: 12,
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
};

describe("PublicBusinessSchema", () => {
	it("accepts the narrow public projection", () => {
		expect(PublicBusinessSchema.safeParse(publicBusiness).success).toBe(true);
	});

	it("accepts a list row carrying the active_businesses_near fields", () => {
		// The five added fields (and the two location coordinates) are OPTIONAL
		// because three producers share this schema and only ONE of them runs the
		// offer aggregate: `GET /businesses/public` emits them,
		// `GET /businesses/public/:id` does not, and `apps/admin` types against it.
		// A required field would force the other two to invent a count nobody
		// measured — the same lie `CategoryDto` refuses with `active_count`.
		const parsed = PublicBusinessSchema.safeParse({
			...publicBusiness,
			active_deals_count: 7,
			distance_km: 1.109124,
			business_location_id: uuid,
			address: "Calle 123",
			latitude: -33.45,
			longitude: -70.66,
			zone: "Centro",
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.active_deals_count).toBe(7);
		expect(parsed.data.distance_km).toBe(1.109124);
		expect(parsed.data.zone).toBe("Centro");
	});

	it("keeps a null distance, which is a measurement and not a missing field", () => {
		// A list row from a request with no `lat`/`lng`. Dropping the key instead
		// would make it indistinguishable from a storefront row, which never
		// measured a distance at all.
		const parsed = PublicBusinessSchema.safeParse({
			...publicBusiness,
			active_deals_count: 1,
			distance_km: null,
			business_location_id: uuid,
			address: "Calle 123",
			latitude: -33.45,
			longitude: -70.66,
			zone: null,
		});
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.distance_km).toBeNull();
		expect(parsed.data.zone).toBeNull();
	});

	it("rejects a negative distance, a fractional count and an empty address", () => {
		// The bounds that matter here are the ones a map consumer cannot infer:
		// `active_deals_count` is a `count(*)` and the LATERAL guarantees a
		// location, so 0 is legal but a negative or fractional value is not; a
		// distance is a magnitude; an address is a `notNull` column.
		//
		// `latitude` / `longitude` are deliberately NOT bounded here, and that is
		// consistency rather than an oversight: `BusinessLocationSchema` — the
		// contract for the same two columns, used by the storefront's
		// `locations` array — declares them as bare `z.number()` too. The real
		// bound is the database's `numeric(10,7)` plus the generated `geog`
		// column, which cannot hold an out-of-range point at all. Adding a range
		// to only this copy of the pair would make the two disagree about the
		// same value.
		const base = {
			...publicBusiness,
			business_location_id: uuid,
			address: "Calle 123",
			latitude: -33.45,
			longitude: -70.66,
		};
		expect(
			PublicBusinessSchema.safeParse({
				...base,
				active_deals_count: 0,
				distance_km: 0,
			}).success,
		).toBe(true);
		for (const bad of [
			{ active_deals_count: -1 },
			{ active_deals_count: 1.5 },
			{ distance_km: -0.1 },
			{ address: "" },
		]) {
			expect(PublicBusinessSchema.safeParse({ ...base, ...bad }).success).toBe(
				false,
			);
		}
	});

	it("carries no panel or money field", () => {
		const parsed = PublicBusinessSchema.safeParse({
			...publicBusiness,
			owner_id: uuid,
			balance: 120.5,
			commission_rate: 0.1,
			is_active: true,
			verification_status: "approved",
			verified_at: "2026-01-01T00:00:00.000Z",
			verified_by: uuid,
			rejection_reason: null,
		});
		// The extras are stripped, not rejected: the contract decides what the
		// surface exposes, and a leaked field has to be impossible to pass
		// through by widening a payload upstream.
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		for (const key of [
			"owner_id",
			"balance",
			"commission_rate",
			"is_active",
			"verification_status",
			"verified_at",
			"verified_by",
			"rejection_reason",
		]) {
			expect(Object.keys(parsed.data)).not.toContain(key);
		}
	});
});

describe("ListPublicBusinessesQuerySchema", () => {
	it("defaults pagination, keeps the name search and defaults sort to deals", () => {
		expect(ListPublicBusinessesQuerySchema.parse({ search: "pan" })).toEqual({
			page: 1,
			limit: 20,
			search: "pan",
			sort: "deals",
		});
	});

	it("has NO default radius, unlike the offers feed", () => {
		// `active_businesses_near` declares `p_radius_km double precision default
		// null`. Defaulting it to 10 km here — as `ListOffersQuerySchema` does,
		// legitimately, because a location-less OFFER request is a feed request —
		// would silently turn every existing `GET /businesses/public` into a 10 km
		// search the first time a caller adds a map.
		const parsed = ListPublicBusinessesQuerySchema.parse({});
		expect(parsed.radius_km).toBeUndefined();
		const withPoint = ListPublicBusinessesQuerySchema.parse({
			lat: -33.45,
			lng: -70.66,
		});
		expect(withPoint.radius_km).toBeUndefined();
	});

	it("keeps `type` a free string, because the RPC lowercases the parameter", () => {
		// `b.type::text = lower(p_type)`: a caller sending `Restaurant` matches
		// `restaurant`. Typing this as `BusinessTypeSchema` would 400 on exactly the
		// input the SQL accepts.
		for (const type of ["bakery", "Bakery", "BAKERY", "not-a-real-type"]) {
			expect(ListPublicBusinessesQuerySchema.parse({ type }).type).toBe(type);
		}
	});

	it("rejects an out-of-range coordinate, a non-positive radius and an unknown sort", () => {
		for (const bad of [
			{ lat: 91 },
			{ lat: -91 },
			{ lng: 181 },
			{ lng: -181 },
			{ radius_km: 0 },
			{ radius_km: -5 },
			{ radius_km: 101 },
			{ sort: "created_at" },
			{ sort: "rating" },
		]) {
			expect(ListPublicBusinessesQuerySchema.safeParse(bad).success).toBe(
				false,
			);
		}
		for (const good of [
			{ lat: 90, lng: 180 },
			{ lat: -90, lng: -180 },
			{ radius_km: 0.001 },
			{ sort: "distance" },
			{ sort: "deals" },
		]) {
			expect(ListPublicBusinessesQuerySchema.safeParse(good).success).toBe(
				true,
			);
		}
	});

	it("ignores the admin-only filters instead of failing on them", () => {
		const parsed = ListPublicBusinessesQuerySchema.parse({
			is_active: "false",
			verification_status: "pending",
			owner_id: uuid,
			mine: "1",
		});
		expect(parsed).toEqual({ page: 1, limit: 20, sort: "deals" });
	});

	it("still rejects a malformed page or limit", () => {
		expect(ListPublicBusinessesQuerySchema.safeParse({ page: 0 }).success).toBe(
			false,
		);
		expect(
			ListPublicBusinessesQuerySchema.safeParse({ limit: 500 }).success,
		).toBe(false);
	});
});

describe("PublicBusinessStorefrontSchema", () => {
	it("requires the business and treats both collections as arrays", () => {
		const parsed = PublicBusinessStorefrontSchema.safeParse({
			business: publicBusiness,
			locations: [],
			hours: [],
		});
		expect(parsed.success).toBe(true);

		// A business with nothing published yet is a state the UI renders, and
		// null would force a second branch for the same meaning.
		expect(
			PublicBusinessStorefrontSchema.safeParse({ business: publicBusiness })
				.success,
		).toBe(false);
	});

	it("keeps the location and hour contracts intact", () => {
		const parsed = PublicBusinessStorefrontSchema.safeParse({
			business: publicBusiness,
			locations: [
				{
					id: uuid,
					business_id: uuid,
					name: "Matriz",
					address: "Calle 123",
					phone: null,
					latitude: -33.45,
					longitude: -70.66,
					is_active: true,
					zone: null,
					is_headquarter: true,
					created_at: "2026-01-01T00:00:00.000Z",
					updated_at: "2026-01-01T00:00:00.000Z",
				},
			],
			hours: [
				{
					id: uuid,
					business_id: uuid,
					day: "monday",
					open_time: "09:00",
					close_time: "18:00",
					is_closed: false,
					created_at: "2026-01-01T00:00:00.000Z",
					updated_at: "2026-01-01T00:00:00.000Z",
				},
			],
		});
		expect(parsed.success).toBe(true);
	});
});
