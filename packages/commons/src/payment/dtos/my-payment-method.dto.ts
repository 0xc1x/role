import type { z } from "zod";
import type {
	MyPaymentMethodListSchema,
	MyPaymentMethodSchema,
} from "../schemas/my-payment-method.schema";

/**
 * Wire DTO for one of the caller's saved cards.
 *
 * Derived with `z.infer` rather than hand-written, so the wire shape and the
 * validation can never drift. Note what this type therefore CANNOT carry: there
 * is no `gateway_token` on it, because there is no `gateway_token` on
 * {@link MyPaymentMethodSchema} (ADR-0007, PCI DSS).
 */
export type MyPaymentMethodDto = z.infer<typeof MyPaymentMethodSchema>;

/** `GET /payment-methods` — default first, newest after. */
export type MyPaymentMethodListDto = z.infer<typeof MyPaymentMethodListSchema>;
