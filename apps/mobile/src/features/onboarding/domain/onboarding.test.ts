import { describe, expect, test } from "bun:test";
import {
	BUSINESS_ONBOARDING_STEPS,
	CONSUMER_ONBOARDING_STEPS,
	ONBOARDING_SEEN_KEY_PREFIX,
	onboardingAudience,
	onboardingSeenKey,
	shouldShowOnboarding,
} from "@/src/features/onboarding/domain/onboarding";

describe("onboardingAudience", () => {
	test("business → business", () => {
		expect(onboardingAudience("business")).toBe("business");
	});

	test("admin → none (operador de plataforma)", () => {
		expect(onboardingAudience("admin")).toBe("none");
	});

	test("user → consumer", () => {
		expect(onboardingAudience("user")).toBe("consumer");
	});

	test("guest (null/undefined) → consumer", () => {
		expect(onboardingAudience(null)).toBe("consumer");
		expect(onboardingAudience(undefined)).toBe("consumer");
	});
});

describe("shouldShowOnboarding", () => {
	test("consumer sin ver → muestra", () => {
		expect(shouldShowOnboarding("user", false)).toBe(true);
	});

	test("consumer visto → no muestra", () => {
		expect(shouldShowOnboarding("user", true)).toBe(false);
	});

	test("guest sin ver → muestra", () => {
		expect(shouldShowOnboarding(null, false)).toBe(true);
		expect(shouldShowOnboarding(undefined, false)).toBe(true);
	});

	test("guest visto → no muestra", () => {
		expect(shouldShowOnboarding(null, true)).toBe(false);
		expect(shouldShowOnboarding(undefined, true)).toBe(false);
	});

	test("business sin ver → muestra", () => {
		expect(shouldShowOnboarding("business", false)).toBe(true);
	});

	test("business visto → no muestra", () => {
		expect(shouldShowOnboarding("business", true)).toBe(false);
	});

	test("admin → nunca muestra (visto o no)", () => {
		expect(shouldShowOnboarding("admin", false)).toBe(false);
		expect(shouldShowOnboarding("admin", true)).toBe(false);
	});
});

describe("onboardingSeenKey", () => {
	test("sin profileId → ámbito guest versionado", () => {
		expect(onboardingSeenKey(null)).toBe(`${ONBOARDING_SEEN_KEY_PREFIX}:guest`);
		expect(onboardingSeenKey(undefined)).toBe(
			`${ONBOARDING_SEEN_KEY_PREFIX}:guest`,
		);
	});

	test("cada cuenta tiene su propia clave", () => {
		expect(onboardingSeenKey("u-1")).toBe(`${ONBOARDING_SEEN_KEY_PREFIX}:u-1`);
		expect(onboardingSeenKey("u-1")).not.toBe(onboardingSeenKey("u-2"));
		expect(onboardingSeenKey("u-1")).not.toBe(onboardingSeenKey(null));
	});
});

test("pasos consumer: exactamente 3 (value, cycle, entry)", () => {
	expect(CONSUMER_ONBOARDING_STEPS.map((step) => step.id)).toEqual([
		"value",
		"cycle",
		"entry",
	]);
});

test("pasos business: exactamente 3 (value, cycle, panel)", () => {
	expect(BUSINESS_ONBOARDING_STEPS.map((step) => step.id)).toEqual([
		"value",
		"cycle",
		"panel",
	]);
});
