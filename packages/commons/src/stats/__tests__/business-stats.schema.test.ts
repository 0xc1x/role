import { describe, expect, it } from "bun:test";
import {
	BusinessCompletedOrdersSchema,
	BusinessDailyStatSchema,
	BusinessSalesStatsQuerySchema,
	BusinessSalesStatsResponseSchema,
	BusinessSalesStatsSchema,
	BusinessTopProductSchema,
} from "../schemas/business-stats.schema";

const uuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const from = "2026-03-01T00:00:00.000Z";
const to = "2026-03-31T23:59:59.999Z";

describe("BusinessSalesStatsQuerySchema", () => {
	it("requires both ends of the window, with no default for either", () => {
		// The SQL function takes p_from and p_to and has no "all time" branch, so a
		// default would be a window this API invented rather than one that was asked
		// for.
		expect(BusinessSalesStatsQuerySchema.safeParse({ from, to }).success).toBe(
			true,
		);
		expect(BusinessSalesStatsQuerySchema.safeParse({}).success).toBe(false);
		expect(BusinessSalesStatsQuerySchema.safeParse({ from }).success).toBe(
			false,
		);
		expect(BusinessSalesStatsQuerySchema.safeParse({ to }).success).toBe(false);
	});

	it("requires an explicit offset, so no zone is chosen on the caller's behalf", () => {
		// `TimestamptzSchema` is deliberately lax because RESPONSES carry
		// `+00:00`. This is an input that gets compared against `orders.created_at`
		// and bucketed by UTC day, and a bare date would leave the API to pick
		// midnight in some zone — the exact silent shift the bucketing avoids.
		expect(
			BusinessSalesStatsQuerySchema.safeParse({
				from: "2026-03-01",
				to: "2026-03-31",
			}).success,
		).toBe(false);
		expect(
			BusinessSalesStatsQuerySchema.safeParse({
				from: "2026-03-01T00:00:00",
				to: "2026-03-31T00:00:00",
			}).success,
		).toBe(false);
		expect(
			BusinessSalesStatsQuerySchema.safeParse({
				from: "2026-03-01T00:00:00-04:00",
				to: "2026-03-31T23:59:59-04:00",
			}).success,
		).toBe(true);
	});

	it("refuses an inverted window and names `to` as the offending key", () => {
		const result = BusinessSalesStatsQuerySchema.safeParse({
			from: "2026-03-31T00:00:00Z",
			to: "2026-03-01T00:00:00Z",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.path).toEqual(["to"]);
		}
	});

	it("accepts a zero-width window, which the inclusive edges make meaningful", () => {
		expect(
			BusinessSalesStatsQuerySchema.safeParse({
				from: "2026-03-01T00:00:00Z",
				to: "2026-03-01T00:00:00Z",
			}).success,
		).toBe(true);
	});
});

describe("BusinessSalesStatsSchema", () => {
	const row = {
		business_id: uuid,
		orders_count: 3,
		revenue: 61.73,
		top_products: [{ name: "Pack sorpresa", sold: 3, revenue: 61.73 }],
		daily: [{ day: "2026-03-01", orders: 3, revenue: 61.73 }],
	};

	it("accepts the mirrored shape", () => {
		expect(BusinessSalesStatsSchema.parse(row)).toEqual(row);
	});

	it("caps top_products at five, because the SQL's limit is five", () => {
		const many = Array.from({ length: 6 }, (_, i) => ({
			name: `Pack ${i}`,
			sold: i,
			revenue: 1,
		}));
		expect(
			BusinessSalesStatsSchema.safeParse({ ...row, top_products: many })
				.success,
		).toBe(false);
	});

	it("carries the 'Desconocido' bucket as an ordinary product name", () => {
		// An order whose offer row is gone is counted and bucketed under this
		// literal. A mirror that filtered those rows out would under-report both
		// `orders_count` and `revenue`, and the UI would have nothing to render.
		expect(
			BusinessTopProductSchema.parse({
				name: "Desconocido",
				sold: 1,
				revenue: 42,
			}),
		).toEqual({ name: "Desconocido", sold: 1, revenue: 42 });
	});

	it("names the daily day as a plain UTC calendar day", () => {
		expect(
			BusinessDailyStatSchema.safeParse({
				day: "2026-03-01",
				orders: 0,
				revenue: 0,
			}).success,
		).toBe(true);
		for (const bad of ["01/03/2026", "2026-3-1", "2026-03-01T00:00:00Z", ""]) {
			expect(
				BusinessDailyStatSchema.safeParse({
					day: bad,
					orders: 0,
					revenue: 0,
				}).success,
			).toBe(false);
		}
	});

	it("echoes the applied window next to the numbers", () => {
		expect(
			BusinessSalesStatsResponseSchema.parse({
				period: { from, to },
				stats: row,
			}),
		).toEqual({ period: { from, to }, stats: row });
	});
});

describe("BusinessCompletedOrdersSchema", () => {
	it("carries the business it is about and a non-negative count", () => {
		expect(
			BusinessCompletedOrdersSchema.parse({
				business_id: uuid,
				completed_orders: 0,
			}),
		).toEqual({ business_id: uuid, completed_orders: 0 });
		expect(
			BusinessCompletedOrdersSchema.safeParse({
				business_id: uuid,
				completed_orders: -1,
			}).success,
		).toBe(false);
	});
});
