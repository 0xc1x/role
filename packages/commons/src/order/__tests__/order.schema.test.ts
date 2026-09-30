import { describe, expect, it } from "bun:test";
import { CreateOrderSchema } from "../schemas/order.schema";
import { AdminOrderListItemSchema } from "../schemas/order.schema";
import {
	CreateOrderRequestSchema,
	ListAdminOrdersQuerySchema,
	ListOrdersQuerySchema,
	UpdateOrderStatusSchema,
} from "../schemas/order-query.schema";
import {
	COUPON_REJECTION_REASONS,
	RESERVE_OFFER_ERROR_CODES,
	ReserveOfferErrorSchema,
	ReserveOfferResultSchema,
} from "../schemas/reserve-offer.schema";
import {
	COUPON_VALIDATION_ERROR_CODES,
	CouponValidationSchema,
	ValidateCouponRequestSchema,
} from "../schemas/coupon-validation.schema";

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

describe("ListAdminOrdersQuerySchema", () => {
	it("defaults page and limit", () => {
		const parsed = ListAdminOrdersQuerySchema.parse({});
		expect(parsed.page).toBe(1);
		expect(parsed.limit).toBe(20);
		expect(parsed.status).toBeUndefined();
		expect(parsed.business_id).toBeUndefined();
		expect(parsed.stuck).toBeUndefined();
	});

	it("accepts a valid status and business", () => {
		const parsed = ListAdminOrdersQuerySchema.parse({
			status: "pending",
			business_id: uuid,
		});
		expect(parsed.status).toBe("pending");
		expect(parsed.business_id).toBe(uuid);
	});

	// La query viaja en el search string: `?stuck=true` llega como texto.
	it.each([
		["true", true],
		["1", true],
		["false", false],
		["0", false],
	])("coerces stuck=%s a booleano", (raw, expected) => {
		expect(ListAdminOrdersQuerySchema.parse({ stuck: raw }).stuck).toBe(
			expected,
		);
	});

	it("rejects an unknown status", () => {
		expect(
			ListAdminOrdersQuerySchema.safeParse({ status: "refunded" }).success,
		).toBe(false);
	});

	it("rejects a non-uuid business_id", () => {
		expect(
			ListAdminOrdersQuerySchema.safeParse({ business_id: "biz-1" }).success,
		).toBe(false);
	});

	it("rejects a non-boolean stuck", () => {
		expect(ListAdminOrdersQuerySchema.safeParse({ stuck: "yes" }).success).toBe(
			false,
		);
	});

	it("rejects limit above 100 and page below 1", () => {
		expect(ListAdminOrdersQuerySchema.safeParse({ limit: 101 }).success).toBe(
			false,
		);
		expect(ListAdminOrdersQuerySchema.safeParse({ page: 0 }).success).toBe(
			false,
		);
	});
});

describe("AdminOrderListItemSchema", () => {
	const item = {
		id: uuid,
		order_number: "FD-2026-0101-001",
		status: "pending" as const,
		business_id: uuid,
		business_name: "Café Central",
		offer_id: uuid,
		offer_title: "Mesa de sobrantes",
		price: 5,
		original_price: 10,
		pickup_start: "2026-01-01T10:00:00+00:00",
		pickup_end: "2026-01-01T18:00:00+00:00",
		is_stuck: true,
		created_at: "2026-01-01T00:00:00+00:00",
		updated_at: "2026-01-01T00:00:00+00:00",
	};

	it("accepts a resolved business name", () => {
		expect(AdminOrderListItemSchema.safeParse(item).success).toBe(true);
	});

	it("accepts a null business_name (leftJoin sin coincidencia)", () => {
		expect(
			AdminOrderListItemSchema.safeParse({ ...item, business_name: null })
				.success,
		).toBe(true);
	});

	it("rejects a row leaking consumer identity or the pickup code", () => {
		// El mapper es la frontera; el schema documenta que esos campos no son
		// parte de la fila. Si alguien los agrega, el contrato se entera.
		const parsed = AdminOrderListItemSchema.safeParse({
			...item,
			user_id: uuid,
			pickup_code: "ABC123",
		});
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data).not.toHaveProperty("user_id");
			expect(parsed.data).not.toHaveProperty("pickup_code");
		}
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

	it("keeps the pre-existing coupon codes valid without a reason", () => {
		// `reason` is optional on purpose: COUPON_EXHAUSTED and
		// COUPON_MIN_NOT_MET have no rejection stage of their own.
		for (const error of ["COUPON_EXHAUSTED", "COUPON_MIN_NOT_MET"]) {
			const parsed = ReserveOfferErrorSchema.safeParse({
				success: false,
				error,
				message: "Cupón rechazado",
			});
			expect(parsed.success).toBe(true);
			if (parsed.success) expect(parsed.data.reason).toBeUndefined();
		}
	});

	it("accepts COUPON_NOT_APPLICABLE with every rejection reason", () => {
		for (const reason of COUPON_REJECTION_REASONS) {
			expect(
				ReserveOfferErrorSchema.safeParse({
					success: false,
					error: "COUPON_NOT_APPLICABLE",
					message: `COUPON_NOT_APPLICABLE: ${reason} - El cupon no aplica`,
					reason,
				}).success,
			).toBe(true);
		}
	});

	it("rejects an unknown rejection reason", () => {
		expect(
			ReserveOfferErrorSchema.safeParse({
				success: false,
				error: "COUPON_NOT_APPLICABLE",
				message: "x",
				reason: "min_not_met",
			}).success,
		).toBe(false);
	});
});

describe("COUPON_REJECTION_REASONS", () => {
	it("covers the four stages of the check and nothing else", () => {
		expect([...COUPON_REJECTION_REASONS]).toEqual([
			"not_found",
			"inactive",
			"expired",
			"wrong_business",
		]);
	});
});

describe("ValidateCouponRequestSchema", () => {
	it("accepts code, business and amount", () => {
		const parsed = ValidateCouponRequestSchema.parse({
			code: "PROMO10",
			business_id: uuid,
			amount: 3990,
		});
		expect(parsed.amount).toBe(3990);
	});

	// `amount` is required, not optional: `min_order_amount` cannot be
	// evaluated without it, and a pre-check that skipped the stage would approve
	// coupons the reservation rejects at submit.
	it("rejects a body with no amount", () => {
		expect(
			ValidateCouponRequestSchema.safeParse({
				code: "PROMO10",
				business_id: uuid,
			}).success,
		).toBe(false);
	});

	it("coerces a numeric string amount", () => {
		// Prices travel as strings from a JSON client; the pre-check must judge
		// the same number the reservation will.
		expect(
			ValidateCouponRequestSchema.parse({
				code: "PROMO10",
				business_id: uuid,
				amount: "3990.50",
			}).amount,
		).toBe(3990.5);
	});

	it("rejects a negative amount", () => {
		expect(
			ValidateCouponRequestSchema.safeParse({
				code: "PROMO10",
				business_id: uuid,
				amount: -1,
			}).success,
		).toBe(false);
	});

	it("rejects a non-uuid business_id", () => {
		expect(
			ValidateCouponRequestSchema.safeParse({
				code: "PROMO10",
				business_id: "biz-1",
				amount: 10,
			}).success,
		).toBe(false);
	});

	it("rejects an empty code", () => {
		expect(
			ValidateCouponRequestSchema.safeParse({
				code: "",
				business_id: uuid,
				amount: 10,
			}).success,
		).toBe(false);
	});

	// The reservation compares the code verbatim, so the pre-check must not
	// normalize it: validating a trimmed code and reserving an untrimmed one
	// would be a disagreement about which code was judged.
	it("does not trim the code", () => {
		expect(
			ValidateCouponRequestSchema.parse({
				code: "  PROMO10  ",
				business_id: uuid,
				amount: 10,
			}).code,
		).toBe("  PROMO10  ");
	});
});

describe("CouponValidationSchema", () => {
	it("accepts the applied verdict with its money", () => {
		expect(
			CouponValidationSchema.safeParse({
				applies: true,
				code: "PROMO10",
				discount: 399,
				final_price: 3591,
			}).success,
		).toBe(true);
	});

	it("accepts every rejection code with no reason", () => {
		for (const error of COUPON_VALIDATION_ERROR_CODES) {
			expect(
				CouponValidationSchema.safeParse({
					applies: false,
					code: "PROMO10",
					error,
				}).success,
			).toBe(true);
		}
	});

	it("accepts COUPON_NOT_APPLICABLE with every shared rejection reason", () => {
		// The pre-check reuses the reservation's reasons, not a parallel list.
		for (const reason of COUPON_REJECTION_REASONS) {
			expect(
				CouponValidationSchema.safeParse({
					applies: false,
					code: "PROMO10",
					error: "COUPON_NOT_APPLICABLE",
					reason,
				}).success,
			).toBe(true);
		}
	});

	it("rejects a reason outside the shared vocabulary", () => {
		expect(
			CouponValidationSchema.safeParse({
				applies: false,
				code: "PROMO10",
				error: "COUPON_NOT_APPLICABLE",
				reason: "min_not_met",
			}).success,
		).toBe(false);
	});

	// A code outside the subset would be a vocabulary only this endpoint knows,
	// and the client would have no branch for it.
	it("rejects a code that is not a reservation code", () => {
		expect(
			CouponValidationSchema.safeParse({
				applies: false,
				code: "PROMO10",
				error: "OFFER_OUT_OF_STOCK",
			}).success,
		).toBe(false);
	});

	it("rejects an applied verdict carrying a rejection code", () => {
		expect(
			CouponValidationSchema.safeParse({
				applies: true,
				code: "PROMO10",
				error: "COUPON_EXHAUSTED",
			}).success,
		).toBe(false);
	});
});

describe("COUPON_VALIDATION_ERROR_CODES", () => {
	it("is the coupon subset of the reservation codes, nothing invented", () => {
		expect([...COUPON_VALIDATION_ERROR_CODES]).toEqual([
			"COUPON_NOT_APPLICABLE",
			"COUPON_EXHAUSTED",
			"COUPON_MIN_NOT_MET",
		]);
		for (const code of COUPON_VALIDATION_ERROR_CODES) {
			expect(RESERVE_OFFER_ERROR_CODES).toContain(code);
		}
	});
});
