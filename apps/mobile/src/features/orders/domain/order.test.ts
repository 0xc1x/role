import { describe, expect, it } from "vitest";

import {
	canTransitionTo,
	orderDiscount,
	orderDiscountPercentage,
	couponIsExpired,
	couponIsExhausted,
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
