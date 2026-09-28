import { describe, expect, it } from "bun:test";
import {
	MarketingPreferencesSchema,
	MeMarketingPreferencesSchema,
	UpdateMyMarketingPreferencesSchema,
} from "../schemas/marketing-preferences.schema";
import {
	UserOrderStatsResponseSchema,
	UserOrderStatsSchema,
} from "../schemas/user-order-stats.schema";

const uuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("UpdateMyMarketingPreferencesSchema", () => {
	it("takes only the two columns a person owns", () => {
		const parsed = UpdateMyMarketingPreferencesSchema.parse({
			is_subscribed: false,
			categories: ["announcements", "news"],
		});
		expect(parsed).toEqual({
			is_subscribed: false,
			categories: ["announcements", "news"],
		});
	});

	it("cannot carry an owner, a timestamp or a source", () => {
		// THE POINT OF THE ROUTE, stated as a contract. `user_id` is omitted so a
		// body naming another account parses into nothing; `unsubscribed_at` and
		// `source` are omitted so the server — not the subject of the compliance
		// record — writes them.
		const parsed = UpdateMyMarketingPreferencesSchema.parse({
			is_subscribed: false,
			user_id: "00000000-0000-0000-0000-000000000001",
			unsubscribed_at: "2000-01-01T00:00:00.000Z",
			source: "forged",
		});
		expect("user_id" in parsed).toBe(false);
		expect("unsubscribed_at" in parsed).toBe(false);
		expect("source" in parsed).toBe(false);
	});

	it("accepts either key alone", () => {
		expect(
			UpdateMyMarketingPreferencesSchema.parse({ is_subscribed: true }),
		).toEqual({ is_subscribed: true });
		expect(
			UpdateMyMarketingPreferencesSchema.parse({ categories: [] }),
		).toEqual({ categories: [] });
		// An empty body is not an error: the repository treats it as a read.
		expect(UpdateMyMarketingPreferencesSchema.parse({})).toEqual({});
	});

	it("rejects a category outside the declared union", () => {
		// A campaign's category is validated against the same union, so a value
		// outside it can never match a campaign — it would be a preference the
		// person believes they hold and that delivers nothing.
		expect(
			UpdateMyMarketingPreferencesSchema.safeParse({
				categories: ["black-friday"],
			}).success,
		).toBe(false);
	});

	it("bounds the list by the size of the union", () => {
		expect(
			UpdateMyMarketingPreferencesSchema.safeParse({
				categories: ["announcements", "promotions", "news", "news"],
			}).success,
		).toBe(false);
	});
});

describe("MarketingPreferencesSchema", () => {
	it("has no created_at, because the column does not exist", () => {
		const row = {
			user_id: uuid,
			is_subscribed: true,
			categories: ["announcements"],
			unsubscribed_at: null,
			source: "seed",
			updated_at: "2026-09-01T00:00:00+00:00",
		};
		expect(MarketingPreferencesSchema.parse(row)).toEqual(row);
		expect("created_at" in MarketingPreferencesSchema.shape).toBe(false);
	});

	it("wraps the standalone GET/PATCH in the same key the rest of /me uses", () => {
		// A handler returning a bare null produces an empty 200 body, so the key is
		// what makes "this account has no marketing preferences row" readable.
		expect(
			MeMarketingPreferencesSchema.safeParse({
				marketing_preferences: null,
			}).success,
		).toBe(true);
		expect(MeMarketingPreferencesSchema.safeParse({}).success).toBe(false);
	});
});

describe("UserOrderStatsSchema", () => {
	it("has no user_id, and therefore no way to ask about somebody else", () => {
		// `user_order_stats(p_user_id)` takes the id as a PARAMETER, safe in
		// Supabase only because it runs under the caller's RLS. There is no RLS on
		// this API's connection, so the contract simply has nowhere to put one.
		expect("user_id" in UserOrderStatsSchema.shape).toBe(false);
		expect(
			UserOrderStatsSchema.parse({ orders_count: 3, total_saved: 50 }),
		).toEqual({ orders_count: 3, total_saved: 50 });
	});

	it("allows a negative saving, unlike the money report's MoneySchema", () => {
		// A discount that rounded against the customer is a fact about the data; a
		// floor would turn it into a 400 on a GET.
		expect(
			UserOrderStatsSchema.safeParse({ orders_count: 1, total_saved: -3.5 })
				.success,
		).toBe(true);
	});

	it("refuses a negative count and a fractional one", () => {
		expect(
			UserOrderStatsSchema.safeParse({ orders_count: -1, total_saved: 0 })
				.success,
		).toBe(false);
		expect(
			UserOrderStatsSchema.safeParse({ orders_count: 1.5, total_saved: 0 })
				.success,
		).toBe(false);
	});

	it("wraps itself in the /me key shape", () => {
		expect(
			UserOrderStatsResponseSchema.parse({
				order_stats: { orders_count: 0, total_saved: 0 },
			}),
		).toEqual({ order_stats: { orders_count: 0, total_saved: 0 } });
	});
});
