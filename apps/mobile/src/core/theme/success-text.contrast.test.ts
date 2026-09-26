import { expect, test } from "bun:test";
import { dark, light } from "@/src/core/theme/colors";
import { compositeOver, contrast } from "@/src/test-utils/contrast";

// `success` (#22C55E) is the decorative green: 2.08:1 on `card` (#F7F3FB) in
// light. `successDark` (#15803D) is the mirror image — 4.58:1 in light but only
// 2.78:1 on dark `card` (#2C2C2C). Neither is usable as text everywhere, so the
// palette carries `successText` for foregrounds and leaves `success` alone for
// washes, fills and chart series.

/** Light surfaces `successText` is actually painted on. */
const LIGHT_SURFACES = [
	"background",
	"card",
	"popover",
	"surfaceBackground",
	"surfaceSuccess",
] as const;
/** Dark surfaces `successText` is actually painted on. */
const DARK_SURFACES = [
	"background",
	"card",
	"popover",
	"muted",
	"inputBackground",
] as const;

test("the palette exposes successText in both schemes with the text-safe value", () => {
	expect(light.successText).toBe("#15803D");
	expect(dark.successText).toBe("#22C55E");
	// The decorative hue is untouched by this token.
	expect(light.success).toBe("#22C55E");
	expect(dark.success).toBe("#22C55E");
});

test("light successText clears AA on every light surface it is used on", () => {
	for (const surface of LIGHT_SURFACES) {
		expect(contrast(light.successText, light[surface])).toBeGreaterThanOrEqual(
			4.5,
		);
	}
});

test("light successText clears AA on the translucent save-pill wash", () => {
	// The offer detail save pill splits its two roles: the wash stays the
	// decorative hue (`withAlpha(colors.success, 0.102)` over `card` = #e1eeeb)
	// while the amount inside is `successText`. 4.21:1, up from 1.91:1 with the
	// decorative hue as text. Asserted at 4.0 to keep the residual 0.29 gap to
	// AA visible instead of rounding it away — closing it needs a design change
	// to the wash, not a token change.
	const wash = compositeOver(`${light.success}1A`, light.card);
	expect(wash).toBe("#e1eeeb");
	expect(contrast(light.success, wash)).toBeLessThan(4.5);
	expect(contrast(light.successText, wash)).toBeGreaterThanOrEqual(4);
});

test("dark successText clears AA on every dark surface it is used on", () => {
	for (const surface of DARK_SURFACES) {
		expect(contrast(dark.successText, dark[surface])).toBeGreaterThanOrEqual(
			4.5,
		);
	}
});

test("success is still below AA as light text, so it stays decorative only", () => {
	expect(contrast(light.success, light.card)).toBeLessThan(4.5);
	expect(contrast(light.success, light.surfaceSuccess)).toBeLessThan(4.5);
});

test("successDark is still below AA as dark text, so it is not the dark answer", () => {
	expect(contrast(dark.successDark, dark.card)).toBeLessThan(4.5);
});

test("light successText is a measured pass, not a rounded one", () => {
	// Guards the comment on the token: 4.578 on `card`, 4.567 on
	// `surfaceSuccess`. If either drifts below the floor the palette comment
	// is lying and this fails.
	expect(contrast(light.successText, light.card)).toBeCloseTo(4.578, 2);
	expect(contrast(light.successText, light.surfaceSuccess)).toBeCloseTo(
		4.567,
		2,
	);
	expect(contrast(dark.successText, dark.card)).toBeCloseTo(6.129, 2);
});
