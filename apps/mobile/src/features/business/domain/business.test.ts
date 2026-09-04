import { describe, expect, test } from "bun:test";
import {
	BUSINESS_TYPE_LABELS,
	DEFAULT_BUSINESS_NOTIFICATION_PREFS,
	PAYOUT_STATUS_LABELS,
} from "@/features/business/domain/business";

describe("business domain constants", () => {
	test("labels cubren tipos y estados", () => {
		expect(BUSINESS_TYPE_LABELS.bakery).toBe("Panadería");
		expect(PAYOUT_STATUS_LABELS.paid).toBe("Pagado");
		expect(DEFAULT_BUSINESS_NOTIFICATION_PREFS.push_enabled).toBe(true);
	});
});
