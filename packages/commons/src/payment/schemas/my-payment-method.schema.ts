import { z } from "zod";
import {
	PaymentGatewaySchema,
	TimestamptzSchema,
	UuidSchema,
} from "../../_common/schemas/common";

/**
 * One of the CALLER's saved cards, as this API returns it.
 *
 * WHY THIS IS A SEPARATE SCHEMA AND NOT `ViewPaymentMethodSchema`: the sibling
 * `PaymentMethodSchema` is the ROW shape, and a response contract derived from a
 * row shape by `.omit()` is a response contract that grows by accident — the
 * next column added to the table is one line away from being in every API
 * response, with no edit to any response contract. This is a hand-written
 * ALLOWLIST instead, so a new column has to be typed here on purpose.
 *
 * ─── PCI DSS: THERE IS NO `gateway_token` FIELD, AND THERE WILL NOT BE ONE ──
 *
 * `gateway_token` is the stored instrument handle and a bearer credential for
 * the gateway. ADR-0007 forbids storing a PAN or a CVV; the token is what
 * replaces them, which makes it the one column in this table whose disclosure
 * turns a card-metadata leak into a chargeable one. It is deliberately absent
 * from this schema, so it is absent from the inferred DTO, so it cannot be
 * returned by a handler whose return type is this one.
 *
 * This is a projection rule, not a storage rule: the column still exists in
 * `public.payment_methods` and the Drizzle mirror still declares it. What is
 * forbidden is the second hop — mirror row → response.
 *
 * The consumer already agrees with the allowlist, which is worth recording
 * because it means the two writers cannot drift: `profileRepository
 * .getPaymentMethods` selects exactly
 * `id, brand, last4, exp_month, exp_year, holder_name, is_default, created_at`
 * and never `gateway_token`. The `user_id` below is the one field this API adds
 * on top of that projection, and it is the caller's own id (see the field).
 *
 * `active` and `deleted_at` are ALSO absent, and on purpose: the list filters
 * them out server-side, so a response that carried them could only ever say
 * "false" and "null". A client that has to filter again is a client that will
 * eventually show a deleted card. The absence of a card from this list IS the
 * deletion.
 */
export const MyPaymentMethodSchema = z.object({
	id: UuidSchema,
	/**
	 * The caller's own id, read from the ROW and never from the request. It
	 * crosses the wire on the same terms as `SavedAddressDto.user_id`: the API
	 * resolves nobody's book but the caller's, so the field is what a client
	 * correlates the response with its own session.
	 */
	user_id: UuidSchema,
	/**
	 * `place_to_pay` is a REAL gateway value, not a placeholder: it is the
	 * pay-at-pickup instrument this product's business model actually uses
	 * (ADR-0007). A client must render it, not treat it as an incomplete
	 * record, and this API does not filter it out.
	 */
	gateway: PaymentGatewaySchema,
	/** Display metadata. The last four digits are the only card digits we hold. */
	brand: z.string().min(1).max(32),
	/**
	 * STRICTER THAN THE COLUMN, ON PURPOSE. The live CHECK is
	 * `char_length(last4) = 4` — LENGTH only, so production would accept
	 * `"abcd"`. This contract additionally requires four DIGITS, matching
	 * `CreatePaymentMethodSchema` in the same domain: two different rules for
	 * one field inside one package would be indefensible, and a non-numeric
	 * `last4` is not a card.
	 *
	 * The honest cost: a row with a non-numeric `last4` would fail this
	 * contract. No gateway produces one, and the only writer in the codebase
	 * that could (`profileRepository.savePaymentMethod`, the ADR's not-yet-wired
	 * scaffold) takes its value from the app's own form. Documented rather than
	 * hidden, because the alternative is a contract that admits `"abcd"`.
	 */
	last4: z.string().regex(/^\d{4}$/),
	/** Mirrors `payment_methods_exp_month_check (exp_month between 1 and 12)`. */
	exp_month: z.number().int().min(1).max(12),
	/**
	 * Mirrors the column, which carries NO CHECK. The domain floor is a real
	 * concern (`CreatePaymentMethodSchema` refuses a past year), but a response
	 * contract that enforces it would reject a row the database considers legal
	 * and turn one stale card into a failed list.
	 */
	exp_year: z.number().int(),
	holder_name: z.string().min(1).max(120),
	/**
	 * At most one of a caller's rows carries this, and NOTHING IN THE DATABASE
	 * ENFORCES IT — `idx_payment_methods_user` is not unique and there is no
	 * partial unique index on `is_default`, so two default rows are writable in
	 * plain SQL today. `PaymentMethodsService.setDefault` is the only
	 * enforcement point on this path; see its note for what it does and does not
	 * close.
	 */
	is_default: z.boolean(),
	created_at: TimestamptzSchema,
});

/**
 * `GET /payment-methods` — the caller's cards, default first and newest after.
 *
 * Exists as a named schema, not as a bare `z.array`, for one reason: it is the
 * other half of the PCI assertion. A test that proves the token is missing from
 * the item shape has not proved anything about the array the handler actually
 * returns, and this is the shape the endpoint returns.
 */
export const MyPaymentMethodListSchema = z.array(MyPaymentMethodSchema);
