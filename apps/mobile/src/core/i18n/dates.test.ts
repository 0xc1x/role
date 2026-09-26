import { describe, expect, test } from "bun:test";
import {
	DAYS_SHORT_ES,
	MONTHS_FULL_CAP_ES,
	MONTHS_FULL_ES,
	MONTHS_SHORT_ES,
} from "@/src/core/i18n/dates";

describe("i18n dates (es-MX)", () => {
	test("every month list has 12 entries", () => {
		expect(MONTHS_SHORT_ES).toHaveLength(12);
		expect(MONTHS_FULL_ES).toHaveLength(12);
		expect(MONTHS_FULL_CAP_ES).toHaveLength(12);
	});

	test("weekday list has 7 entries starting on Sunday", () => {
		expect(DAYS_SHORT_ES).toHaveLength(7);
		expect(DAYS_SHORT_ES[0]).toBe("dom");
	});

	test("short month abbreviations are stable at both ends", () => {
		expect(MONTHS_SHORT_ES[0]).toBe("ene");
		expect(MONTHS_SHORT_ES[11]).toBe("dic");
	});

	test("full month names keep their distinct case variants", () => {
		expect(MONTHS_FULL_ES[6]).toBe("julio");
		expect(MONTHS_FULL_CAP_ES[6]).toBe("Julio");
		expect(MONTHS_FULL_ES[6]).not.toBe(MONTHS_FULL_CAP_ES[6]);
	});

	test("capitalized September is the only multi-word month", () => {
		expect(MONTHS_FULL_CAP_ES[8]).toBe("Septiembre");
		expect(MONTHS_FULL_ES[8]).toBe("septiembre");
	});
});
