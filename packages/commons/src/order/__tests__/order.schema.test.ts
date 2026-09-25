import { describe, expect, it } from "bun:test";
import { CreateOrderSchema } from "../schemas/order.schema";
import {
	CreateOrderRequestSchema,
	ListOrdersQuerySchema,
	UpdateOrderStatusSchema,
} from "../schemas/order-query.schema";
import {
	ReserveOfferErrorSchema,
	ReserveOfferResultSchema,
} from "../schemas/reserve-offer.schema";

const uuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

describe("CreateOrderRequestSchema", () => {
	it("accepts offer_id only", () => {
		expect(CreateOrderRequestSchema.safeParse({ offer_id: uuid }).success).toBe(
			true,
		);
	});

	it("rejects invalid uuid", () => {
		expect(
			CreateOrderRequestSchema.safeParse({ offer_id: "bad" }).success,
		).toBe(false);
	});
});

describe("CreateOrderSchema", () => {
	const order = {
		user_id: uuid,
		offer_id: uuid,
		business_id: uuid,
		order_number: "FD-2026-0925-001",
		price: 5,
		original_price: 10,
		pickup_code: "ABC123",
		commission_rate: 0.1,
		platform_fee: 0.5,
		net_amount: 4.5,
	};

	it("accepts a bounded idempotency key", () => {
		expect(
			CreateOrderSchema.safeParse({
				...order,
				idempotency_key: "reservation-1",
			}).success,
		).toBe(true);
		expect(
			CreateOrderSchema.safeParse({
				...order,
				idempotency_key: "x".repeat(129),
			}).success,
		).toBe(false);
	});
});

describe("ListOrdersQuerySchema", () => {
	it("defaults page and limit", () => {
		const parsed = ListOrdersQuerySchema.parse({});
		expect(parsed.page).toBe(1);
		expect(parsed.limit).toBe(20);
	});

	it("rejects limit above 100", () => {
		expect(ListOrdersQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
	});
});

describe("UpdateOrderStatusSchema", () => {
	it("accepts valid status", () => {
		expect(
			UpdateOrderStatusSchema.safeParse({ status: "confirmed" }).success,
		).toBe(true);
	});

	it("rejects unknown status", () => {
		expect(
			UpdateOrderStatusSchema.safeParse({ status: "invalid" }).success,
		).toBe(false);
	});
});

describe("ReserveOfferResponseSchema", () => {
	it("accepts success result", () => {
		expect(
			ReserveOfferResultSchema.safeParse({
				success: true,
				order_id: uuid,
				order_number: "FD-2026-0101-001",
				pickup_code: "ABC123",
				price: 5,
				original_price: 10,
				discount: 5,
				platform_fee: 0.5,
				net_amount: 4.5,
				status: "pending",
				replayed: true,
			}).success,
		).toBe(true);
	});

	it("accepts error result", () => {
		expect(
			ReserveOfferErrorSchema.safeParse({
				success: false,
				error: "OFFER_OUT_OF_STOCK",
				message: "Sin stock",
			}).success,
		).toBe(true);
	});

	it("accepts idempotency-key errors from the RPC", () => {
		expect(
			ReserveOfferErrorSchema.safeParse({
				success: false,
				error: "IDEMPOTENCY_KEY_REUSED",
				message: "La clave ya fue usada para otra reserva",
			}).success,
		).toBe(true);
	});
});
