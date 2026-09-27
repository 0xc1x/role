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
	it("defaults pagination and keeps the name search", () => {
		expect(ListPublicBusinessesQuerySchema.parse({ search: "pan" })).toEqual({
			page: 1,
			limit: 20,
			search: "pan",
		});
	});

	it("ignores the admin-only filters instead of failing on them", () => {
		const parsed = ListPublicBusinessesQuerySchema.parse({
			is_active: "false",
			verification_status: "pending",
			owner_id: uuid,
			mine: "1",
		});
		expect(parsed).toEqual({ page: 1, limit: 20 });
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
