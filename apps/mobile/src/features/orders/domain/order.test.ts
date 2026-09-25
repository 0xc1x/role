import { describe, expect, it } from "bun:test";

import {
	canTransitionTo,
	orderDiscount,
	orderDiscountPercentage,
	couponIsExpired,
	couponIsExhausted,
	lastEventTimeFor,
	findLastEventTime,
	checkoutTotals,
	meetsCouponMinimum,
	filterByHistoryPeriod,
	orderStatusTone,
	type OrderStatusEvent,
} from "@/src/features/orders/domain/order";

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
		expect(
			lastEventTimeFor(events, ["picked_up", "completed"], "fallback"),
		).toBe("2026-08-01T13:00:00Z");
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

describe("findLastEventTime", () => {
	it("devuelve null cuando no hay eventos del estado (nunca fabrica)", () => {
		expect(findLastEventTime([], ["confirmed"])).toBeNull();
		expect(
			findLastEventTime(
				[{ status: "pending", created_at: "2026-08-01T10:00:00Z" }],
				["ready_for_pickup"],
			),
		).toBeNull();
	});

	it("devuelve el ISO del último evento coincidente", () => {
		expect(
			findLastEventTime(
				[
					{ status: "confirmed", created_at: "2026-08-01T10:05:00Z" },
					{ status: "confirmed", created_at: "2026-08-02T09:00:00Z" },
				],
				["confirmed"],
			),
		).toBe("2026-08-02T09:00:00Z");
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

describe("checkoutTotals", () => {
	const offer = { original_price: 100, discounted_price: 80 };
	const pct = {
		type: "percentage",
		value: 10,
	} as Parameters<typeof checkoutTotals>[1];

	it("calcula descuento y total en centavos (sin float)", () => {
		const t = checkoutTotals(offer, pct);
		expect(t.offerDiscount).toBe(20);
		expect(t.coupon).toBe(8);
		expect(t.total).toBe(72);
	});

	it("sin cupón el total es el precio con descuento", () => {
		const t = checkoutTotals(offer, null);
		expect(t.coupon).toBe(0);
		expect(t.total).toBe(80);
	});

	it("el cupón nunca deja el total en negativo", () => {
		const fixed = { type: "fixed", value: 200 } as Parameters<
			typeof checkoutTotals
		>[1];
		expect(checkoutTotals(offer, fixed).total).toBe(0);
	});

	it("meetsCouponMinimum compara en las mismas unidades", () => {
		expect(meetsCouponMinimum(80, null)).toBe(true);
		expect(meetsCouponMinimum(80, 80)).toBe(true);
		expect(meetsCouponMinimum(79.99, 80)).toBe(false);
	});
});

describe("history filter", () => {
	const items = [
		{ order: { created_at: "2026-09-01T12:00:00Z" } },
		{ order: { created_at: "2026-09-08T12:00:00Z" } },
	] as const;

	it("all devuelve todo", () => {
		expect(
			filterByHistoryPeriod(
				[...items],
				"all",
				0,
				new Date("2026-09-08T12:00:00Z"),
			),
		).toHaveLength(2);
	});

	it("today filtra por día", () => {
		const res = filterByHistoryPeriod(
			[...items],
			"today",
			0,
			new Date("2026-09-08T12:00:00Z"),
		);
		expect(res).toHaveLength(1);
	});

	it("week usa lunes-domingo con offset", () => {
		// 2026-09-08 es martes: semana actual contiene solo el item del 08.
		const now = new Date("2026-09-08T12:00:00Z");
		expect(filterByHistoryPeriod([...items], "week", 0, now)).toHaveLength(1);
		// Offset -1: semana del 31/08-06/09 contiene el item del 01/09.
		expect(filterByHistoryPeriod([...items], "week", -1, now)).toHaveLength(1);
	});

	it("orderStatusTone mapea estados", () => {
		expect(orderStatusTone("pending")).toBe("warning");
		expect(orderStatusTone("completed")).toBe("success");
		expect(orderStatusTone("expired")).toBe("danger");
	});
});
