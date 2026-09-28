import { describe, expect, it } from "bun:test";
import {
	MyPaymentMethodListSchema,
	MyPaymentMethodSchema,
} from "../schemas/my-payment-method.schema";

const uuid = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

/** A card row exactly as the API mapper produces it. */
const aMethod = {
	id: uuid,
	user_id: uuid,
	gateway: "place_to_pay",
	brand: "visa",
	last4: "4242",
	exp_month: 12,
	exp_year: 2030,
	holder_name: "Ana López",
	is_default: true,
	created_at: "2026-08-22T23:18:09+00:00",
};

describe("MyPaymentMethodSchema (the consumer's saved-card response)", () => {
	it("accepts a display-projected card", () => {
		expect(MyPaymentMethodSchema.safeParse(aMethod).success).toBe(true);
	});

	it("accepts every gateway, and place_to_pay is a real value", () => {
		// `place_to_pay` is the pay-at-pickup instrument this product's business
		// model actually uses. Treating it as a placeholder would make the
		// contract reject the product's own instrument.
		for (const gateway of ["place_to_pay", "stripe"] as const) {
			expect(
				MyPaymentMethodSchema.safeParse({ ...aMethod, gateway }).success,
			).toBe(true);
		}
	});

	it("rejects a gateway outside the enum", () => {
		expect(
			MyPaymentMethodSchema.safeParse({ ...aMethod, gateway: "paypal" })
				.success,
		).toBe(false);
	});

	it("has no gateway_token field — the PCI allowlist, asserted on the shape", () => {
		// Asserted on the SHAPE, not on a parse. A parse cannot answer this
		// question: `z.object()` in Zod 4 STRIPS unknown keys, so feeding a
		// response shape a `gateway_token` and checking the output is a test that
		// passes precisely when the leak is present. The real proof that the token
		// never leaves is `PaymentMethodsMapper.toDto`'s explicit allowlist, pinned
		// against the ACTUAL returned object in
		// `apps/api/src/modules/payment-methods/payment-methods.service.db.spec.ts`.
		expect(Object.keys(MyPaymentMethodSchema.shape)).not.toContain(
			"gateway_token",
		);
		expect(Object.keys(MyPaymentMethodSchema.shape).sort()).toEqual([
			"brand",
			"created_at",
			"exp_month",
			"exp_year",
			"gateway",
			"holder_name",
			"id",
			"is_default",
			"last4",
			"user_id",
		]);
	});

	it("carries no soft-delete columns — the list has already filtered them", () => {
		// `active` and `deleted_at` are filtered server-side, so in this contract
		// they could only ever be `true` and `null`. Their absence is the point:
		// a client that does not have to filter cannot show a deleted card.
		for (const column of ["active", "deleted_at", "updated_at"]) {
			expect(Object.keys(MyPaymentMethodSchema.shape)).not.toContain(column);
		}
	});

	it("strips a gateway_token rather than echoing it (documented, not relied on)", () => {
		// Recorded because it is the trap above in miniature: parse output looks
		// clean whether or not the input was. This asserts the stripping happens;
		// it is NOT the guarantee.
		const parsed = MyPaymentMethodSchema.parse({
			...aMethod,
			gateway_token: "tok_live_secret",
		});
		expect("gateway_token" in parsed).toBe(false);
	});

	it("holds the mirror's own CHECKs, so a forbidden row cannot satisfy it", () => {
		// `payment_methods_exp_month_check` and `payment_methods_last4_check`.
		for (const exp_month of [0, 13]) {
			expect(
				MyPaymentMethodSchema.safeParse({ ...aMethod, exp_month }).success,
			).toBe(false);
		}
		for (const last4 of ["424", "42420", "abcd", ""]) {
			expect(
				MyPaymentMethodSchema.safeParse({ ...aMethod, last4 }).success,
			).toBe(false);
		}
	});
});

describe("MyPaymentMethodListSchema", () => {
	it("is the array the list endpoint returns", () => {
		expect(MyPaymentMethodListSchema.parse([aMethod]).length).toBe(1);
		expect(MyPaymentMethodListSchema.parse([])).toEqual([]);
	});

	it("is token-free at the ARRAY level, not only on the item", () => {
		// The item-level assertion above does not cover the array: a handler
		// could wrap items and add a sibling field, and an item-only schema would
		// never see it.
		const parsed = MyPaymentMethodListSchema.parse([
			aMethod,
			{ ...aMethod, id: uuid.replace(/^./, "b") },
		]);
		for (const item of parsed) {
			expect("gateway_token" in item).toBe(false);
		}
	});
});
