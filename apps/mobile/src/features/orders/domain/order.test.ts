import { describe, expect, it } from "vitest";

import {
	canTransitionTo,
	orderDiscount,
	orderDiscountPercentage,
	couponIsExpired,
	couponIsExhausted,
	lastEventTimeFor,
	type OrderStatusEvent,
} from "@/features/orders/domain/order";

describe("order status transitions", () => {
	it("allows pending → confirmed", () => {
		expect(canTransitionTo("pending", "confirmed")).toBe(true);
	});

	it("allows confirmed → ready_for_pickup", () => {
		expect(canTransitionTo("confirmed", "ready_for_pickup")).toBe(true);
	});

	it("forbids jumping confirmed → completed", () => {
		expect(canTransitionTo("confirmed", "completed")).toBe(false);
	});

	it("forbids backward transitions", () => {
		expect(canTransitionTo("ready_for_pickup", "confirmed")).toBe(false);
	});
});

describe("order discount helpers", () => {
	it("computes absolute and percentage discount", () => {
		const order = { original_price: 100, price: 30 };
		expect(orderDiscount(order)).toBe(70);
		expect(orderDiscountPercentage(order)).toBe(70);
	});

	it("handles zero original price", () => {
		const order = { original_price: 0, price: 0 };
		expect(orderDiscountPercentage(order)).toBe(0);
	});
});

describe("lastEventTimeFor", () => {
	const events: OrderStatusEvent[] = [
		{ status: "pending", created_at: "2026-08-01T10:00:00Z" },
		{ status: "confirmed", created_at: "2026-08-01T10:05:00Z" },
		{ status: "ready_for_pickup", created_at: "2026-08-01T12:30:00Z" },
		{ status: "completed", created_at: "2026-08-01T13:00:00Z" },
	];

	it("devuelve el timestamp del evento con ese estado", () => {
		expect(lastEventTimeFor(events, ["confirmed"], "fallback")).toBe(
			"2026-08-01T10:05:00Z",
		);
	});

	it("devuelve el más reciente entre varios estados candidatos", () => {
		expect(lastEventTimeFor(events, ["picked_up", "completed"], "fallback")).toBe(
			"2026-08-01T13:00:00Z",
		);
	});

	it("usa el último registro si el estado se repite", () => {
		const repeated: OrderStatusEvent[] = [
			{ status: "confirmed", created_at: "2026-08-01T10:05:00Z" },
			{ status: "confirmed", created_at: "2026-08-02T09:00:00Z" },
		];
		expect(lastEventTimeFor(repeated, ["confirmed"], "fallback")).toBe(
			"2026-08-02T09:00:00Z",
		);
	});

	it("cae al fallback cuando no hay eventos del estado", () => {
		expect(lastEventTimeFor(events, ["cancelled"], "fallback")).toBe(
			"fallback",
		);
	});

	it("cae al fallback sin eventos (RLS u órdenes previas al logging)", () => {
		expect(lastEventTimeFor([], ["confirmed"], "fallback")).toBe("fallback");
	});
});

describe("coupon helpers", () => {
	it("detects expiry", () => {
		const now = new Date("2025-01-15T12:00:00Z");
		expect(couponIsExpired({ expires_at: "2025-01-14T00:00:00Z" }, now)).toBe(
			true,
		);
		expect(couponIsExpired({ expires_at: null }, now)).toBe(false);
	});

	it("detects exhaustion", () => {
		expect(couponIsExhausted({ max_uses: 10, used_count: 10 })).toBe(true);
		expect(couponIsExhausted({ max_uses: 10, used_count: 5 })).toBe(false);
	});
});
