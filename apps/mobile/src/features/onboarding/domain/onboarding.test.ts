import { describe, expect, test } from "bun:test";
import {
	BUSINESS_ONBOARDING_STEPS,
	CONSUMER_ONBOARDING_STEPS,
	ONBOARDING_SEEN_KEY_PREFIX,
	clampPage,
	onboardingAudience,
	onboardingSeenKey,
	pageFromOffset,
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

describe("clampPage", () => {
	test("acota al rango válido", () => {
		expect(clampPage(0, 3)).toBe(0);
		expect(clampPage(2, 3)).toBe(2);
		expect(clampPage(-1, 3)).toBe(0);
		expect(clampPage(7, 3)).toBe(2);
	});

	test("sin páginas → 0 (nunca -1)", () => {
		expect(clampPage(4, 0)).toBe(0);
		expect(clampPage(-2, 0)).toBe(0);
	});
});

describe("pageFromOffset", () => {
	const W = 390; // ancho de página
	const TOTAL = 3;

	test("offset en página completa → esa página", () => {
		expect(pageFromOffset(0, W, TOTAL)).toBe(0);
		expect(pageFromOffset(W, W, TOTAL)).toBe(1);
		expect(pageFromOffset(W * 2, W, TOTAL)).toBe(2);
	});

	test("el progreso cambia al cruzar la mitad, no al soltar", () => {
		// Este es el fix: el índice sale del offset en cada onScroll, así que
		// arrastrar a la mitad de la segunda página ya avanza el paso (antes
		// solo avanzaba el botón, porque web nunca emite momentum).
		expect(pageFromOffset(W * 0.49, W, TOTAL)).toBe(0);
		expect(pageFromOffset(W * 0.51, W, TOTAL)).toBe(1);
	});

	test("arrastre corto que vuelve (snap back) no deja el paso a medias", () => {
		expect(pageFromOffset(W * 0.4, W, TOTAL)).toBe(0);
	});

	test("rubber-band del borde queda acotado", () => {
		expect(pageFromOffset(-40, W, TOTAL)).toBe(0);
		expect(pageFromOffset(W * 2 + 60, W, TOTAL)).toBe(2);
	});

	test("ancho sin medir no propaga NaN", () => {
		expect(pageFromOffset(W, 0, TOTAL)).toBe(0);
		expect(pageFromOffset(Number.NaN, W, TOTAL)).toBe(0);
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
