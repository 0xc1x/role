import { expect, test } from "bun:test";
import { dark, light, type ColorTokens } from "@/src/core/theme/colors";
import { compositeOver, contrast } from "@/src/test-utils/contrast";

/**
 * `warning` (#F59E0B) and `info` (#0D9488) are decorative hues: washes, fills,
 * status dots, glows. Neither is text-safe, so the palette carries
 * `warningText` / `infoText` for foregrounds and leaves the decorative tokens
 * alone. This file is the measured contract for those four values plus the two
 * solid action fills the order flow needs.
 *
 * Every number below is asserted at its real precision. Where a ratio lands
 * short of a floor the shortfall is asserted at the floor it misses, never
 * rounded up into a pass.
 */

/** Light surfaces `warningText` is actually painted on, per call site. */
const WARNING_LIGHT_SURFACES = [
	"card", // StatusBadge-adjacent cards, KPI values, review stars
	"background",
	"popover",
	"muted",
	"surfaceMuted",
	"surfaceWarning", // StatusBadge tone, order timeline glyph, alert icon
	"surfaceWarningDark",
] as const;

/** Dark surfaces `warningText` is actually painted on. */
const WARNING_DARK_SURFACES = [
	"card",
	"background",
	"popover",
	"muted",
	"inputBackground",
] as const;

/** Light surfaces `infoText` is actually painted on, per call site. */
const INFO_LIGHT_SURFACES = [
	"card", // map callout, stats KPI value
	"background",
	"popover",
	"muted",
	"surfaceMuted",
	"infoSurface", // StatusBadge tone, order timeline glyph, help category icon
	"infoSurfaceBorder",
] as const;

/** Dark surfaces `infoText` is actually painted on. */
const INFO_DARK_SURFACES = [
	"card",
	"background",
	"popover",
	"muted",
	"inputBackground",
] as const;

/** Dark `surface*` tokens are alpha washes; flatten them the way the device does. */
function opaque(scheme: "light" | "dark", key: keyof typeof light): string {
	const tokens: ColorTokens = scheme === "light" ? light : dark;
	const value = tokens[key];
	return value.length > 7 ? compositeOver(value, tokens.card) : value;
}

test("the palette exposes the text-safe tokens in both schemes", () => {
	expect(light.warningText).toBe("#C2410C");
	expect(dark.warningText).toBe("#F59E0B");
	expect(light.infoText).toBe("#115E59");
	expect(dark.infoText).toBe("#2DD4BF");
});

test("the solid action fills exist in both schemes and are the measured values", () => {
	expect(light.successAction).toBe("#15803D");
	expect(light.successActionForeground).toBe("#FFFFFF");
	expect(dark.successAction).toBe("#22C55E");
	expect(dark.successActionForeground).toBe("#1A1A18");
	expect(light.infoAction).toBe("#115E59");
	expect(light.infoActionForeground).toBe("#FFFFFF");
	expect(dark.infoAction).toBe("#2DD4BF");
	expect(dark.infoActionForeground).toBe("#1A1A18");
});

test("the decorative hues the new tokens replace are untouched", () => {
	expect(light.warning).toBe("#F59E0B");
	expect(dark.warning).toBe("#F59E0B");
	expect(light.info).toBe("#0D9488");
	expect(dark.info).toBe("#2DD4BF");
	expect(light.warningDark).toBe("#C2410C");
	expect(dark.warningDark).toBe("#C2410C");
});

test("warning and info are still below AA as light text, so they stay decorative", () => {
	expect(contrast(light.warning, light.card)).toBeLessThan(4.5);
	expect(contrast(light.warning, light.surfaceWarning)).toBeLessThan(4.5);
	expect(contrast(light.info, light.card)).toBeLessThan(4.5);
	expect(contrast(light.info, light.infoSurface)).toBeLessThan(4.5);
});

test("light warningText clears AA on every light surface it is used on", () => {
	for (const surface of WARNING_LIGHT_SURFACES) {
		expect(contrast(light.warningText, light[surface])).toBeGreaterThanOrEqual(
			4.5,
		);
	}
});

test("dark warningText clears AA on every opaque dark surface it is used on", () => {
	for (const surface of WARNING_DARK_SURFACES) {
		expect(contrast(dark.warningText, dark[surface])).toBeGreaterThanOrEqual(
			4.5,
		);
	}
});

test("light infoText clears AA on every light surface it is used on", () => {
	for (const surface of INFO_LIGHT_SURFACES) {
		expect(contrast(light.infoText, light[surface])).toBeGreaterThanOrEqual(
			4.5,
		);
	}
});

test("dark infoText clears AA on every opaque dark surface it is used on", () => {
	for (const surface of INFO_DARK_SURFACES) {
		expect(contrast(dark.infoText, dark[surface])).toBeGreaterThanOrEqual(4.5);
	}
});

test("the measured values behind the palette comments are still true", () => {
	// Guards the doc comments on `warningText` / `infoText`: if a value drifts,
	// the comment is lying and this fails.
	expect(contrast(light.warningText, light.card)).toBeCloseTo(4.727, 2);
	expect(contrast(light.warningText, light.surfaceWarning)).toBeCloseTo(
		4.821,
		2,
	);
	expect(contrast(light.warningText, light.background)).toBeCloseTo(4.98, 2);
	expect(contrast(dark.warningText, dark.card)).toBeCloseTo(6.503, 2);
	expect(contrast(light.infoText, light.card)).toBeCloseTo(6.922, 2);
	expect(contrast(light.infoText, light.infoSurface)).toBeCloseTo(7.271, 2);
	expect(contrast(light.infoText, light.background)).toBeCloseTo(7.293, 2);
	expect(contrast(dark.infoText, dark.card)).toBeCloseTo(7.502, 2);
});

test("warningText is a measured pass, not a rounded one", () => {
	// Light is the tight side: 4.727 on `card`, 4.553 on `surfaceMuted`, 4.519
	// on `surfaceWarningDark`. Asserted at 4.5 so a hair of drift fails.
	expect(contrast(light.warningText, light.card)).toBeGreaterThanOrEqual(4.7);
	expect(
		contrast(light.warningText, light.surfaceMuted),
	).toBeGreaterThanOrEqual(4.5);
	expect(
		contrast(light.warningText, light.surfaceWarningDark),
	).toBeGreaterThanOrEqual(4.5);
});

test("warningText still misses AA on the two amber washes, and that is asserted", () => {
	// The location "headquarters" chip and the stats KPI icon chip both tint the
	// card with `withAlpha(colors.warning, ~0.15)` — the wash stays decorative.
	// The glyph and the value moved to `warningText`; on the flattened wash it
	// reaches 4.255:1, still 0.245 short of 4.5. Closing it needs a change to the
	// wash, not to the token, so the gap is pinned at 4.25 instead of hidden.
	const wash = compositeOver(`${light.warning}26`, light.card);
	expect(wash).toBe("#f7e6d7");
	expect(contrast(light.warning, wash)).toBeLessThan(2);
	expect(contrast(light.warningText, wash)).toBeCloseTo(4.255, 2);
	expect(contrast(light.warningText, wash)).toBeLessThan(4.5);
	expect(contrast(light.warningText, wash)).toBeGreaterThanOrEqual(4.25);
});

test("dark warningText still misses AA on the dark warning wash, and that is asserted", () => {
	// Dark `surfaceWarning` is `#FBBF2433` over `card`, i.e. #55492a. The amber
	// that is text-safe on dark `card` (6.50:1) only reaches 4.12:1 there. No
	// pairing in the palette does better on that wash, so the badge icon and the
	// order timeline glyph share the gap. Pinned at 4.12.
	const wash = opaque("dark", "surfaceWarning");
	expect(wash).toBe("#55492a");
	expect(contrast(dark.warningText, wash)).toBeCloseTo(4.121, 2);
	expect(contrast(dark.warningText, wash)).toBeLessThan(4.5);
	expect(contrast(dark.warningText, wash)).toBeGreaterThanOrEqual(4.1);
	// The darker alternative is worse still, which is why dark `warningText` is
	// the amber and not `warningDark`.
	expect(contrast(dark.warningDark, wash)).toBeLessThan(2.4);
});

test("the stats KPI icon chip wash follows the token, so the glyph is recomputed on it", () => {
	// `KpiCard` builds its chip from `withAlpha(color, 0.15)`, so migrating the
	// colour migrates the wash too. The 16px glyph on it is non-text: 3:1 floor.
	const lightWash = compositeOver(`${light.warningText}26`, light.card);
	expect(contrast(light.warningText, lightWash)).toBeGreaterThanOrEqual(3);
	const darkWash = compositeOver(`${dark.warningText}26`, dark.card);
	expect(contrast(dark.warningText, darkWash)).toBeGreaterThanOrEqual(3);
	const lightInfoWash = compositeOver(`${light.infoText}26`, light.card);
	expect(contrast(light.infoText, lightInfoWash)).toBeGreaterThanOrEqual(3);
	const darkInfoWash = compositeOver(`${dark.infoText}26`, dark.card);
	expect(contrast(dark.infoText, darkInfoWash)).toBeGreaterThanOrEqual(3);
});

test("infoText clears AA on the offer detail counter wash", () => {
	// The note row is `withAlpha(colors.infoForeground, 0.051)` over `card`,
	// left decorative; the `Info` glyph inside it moved to `infoText`.
	const wash = compositeOver(`${light.infoForeground}0D`, light.card);
	expect(wash).toBe("#ebebf3");
	expect(contrast(light.info, wash)).toBeLessThan(3.5);
	expect(contrast(light.infoText, wash)).toBeGreaterThanOrEqual(4.5);
});

test("infoText clears AA on the dark info wash", () => {
	const wash = opaque("dark", "infoSurface");
	expect(wash).toBe("#2c4e49");
	expect(contrast(dark.infoText, wash)).toBeCloseTo(4.92, 2);
	expect(contrast(dark.infoText, wash)).toBeGreaterThanOrEqual(4.5);
});

test("the explore tip bulb glyph is non-text and clears 3:1 on its circle", () => {
	// Light: the tip card is `yellowLight` (#FDE68A) and the lit bulb circle is
	// `withAlpha(colors.yellow, 0.35)` over it → #fcd866. The decorative amber
	// measured 1.55:1 there, under the 3:1 floor a 20px glyph needs.
	const bulb = compositeOver(`${light.yellow}59`, light.yellowLight);
	expect(bulb).toBe("#fcd866");
	expect(contrast(light.warning, bulb)).toBeLessThan(2);
	expect(contrast(light.warningText, bulb)).toBeCloseTo(3.737, 2);
	expect(contrast(light.warningText, bulb)).toBeGreaterThanOrEqual(3);
});

test("the landing hero keeps the decorative amber because it is already compliant there", () => {
	// The one `colors.warning` text foreground left in the app, and it must stay:
	// the hero word sits on `colors.primary` (#371949) at h1/24px/800, which is
	// WCAG large text, so the floor is 3:1 and the amber measures 7.00:1.
	// `warningText` would drop it to 2.90:1 — migrating this site would be a
	// regression. Asserted so the allowlist entry in the purity guard is a
	// measurement, not a claim.
	expect(contrast(light.warning, light.primary)).toBeCloseTo(6.996, 2);
	expect(contrast(light.warning, light.primary)).toBeGreaterThanOrEqual(3);
	expect(contrast(light.warningText, light.primary)).toBeLessThan(3);
});

test("the order action labels clear AA on their own fills in both schemes", () => {
	// "marcar listo" (infoAction) and "validar entrega" (successAction). Before
	// the split these were `primaryForeground` on `info` / `success`: 3.74:1 and
	// 2.28:1 in light, both under the 4.5:1 floor for the 14px semiBold label.
	expect(contrast(light.primaryForeground, light.info)).toBeCloseTo(3.744, 2);
	expect(contrast(light.primaryForeground, light.success)).toBeCloseTo(
		2.279,
		2,
	);

	for (const scheme of ["light", "dark"] as const) {
		const tokens = scheme === "light" ? light : dark;
		expect(
			contrast(tokens.infoActionForeground, tokens.infoAction),
		).toBeGreaterThanOrEqual(4.5);
		expect(
			contrast(tokens.successActionForeground, tokens.successAction),
		).toBeGreaterThanOrEqual(4.5);
	}
});

test("the order action label ratios are measured passes", () => {
	expect(
		contrast(light.successActionForeground, light.successAction),
	).toBeCloseTo(5.016, 2);
	expect(
		contrast(dark.successActionForeground, dark.successAction),
	).toBeCloseTo(7.649, 2);
	expect(contrast(light.infoActionForeground, light.infoAction)).toBeCloseTo(
		7.584,
		2,
	);
	expect(contrast(dark.infoActionForeground, dark.infoAction)).toBeCloseTo(
		9.363,
		2,
	);
});

test("the action fills are also distinguishable from the card they sit on", () => {
	// A control boundary a user cannot see is not a control. The old green
	// measured 2.08:1 against `card`; the new one 4.58:1. Same story for teal.
	expect(contrast(light.success, light.card)).toBeCloseTo(2.08, 2);
	expect(contrast(light.successAction, light.card)).toBeCloseTo(4.578, 2);
	expect(contrast(light.info, light.card)).toBeCloseTo(3.418, 2);
	expect(contrast(light.infoAction, light.card)).toBeCloseTo(6.922, 2);
});

test("the OrderCard progress glyph clears the 3:1 non-text floor on its circle", () => {
	// Same pair, same numbers: the 20px station glyph is non-text, and the old
	// `success` fill under a light glyph measured 2.28:1.
	for (const scheme of ["light", "dark"] as const) {
		const tokens = scheme === "light" ? light : dark;
		expect(
			contrast(tokens.successActionForeground, tokens.successAction),
		).toBeGreaterThanOrEqual(3);
	}
});

test("the disabled order action is no worse than it was, and no better either", () => {
	// `Button` dims every disabled or loading pressable with `opacity-50`, which
	// flattens the label and the fill together. That is a design-system-wide
	// behaviour, not something these two buttons own, so the honest claim is only
	// "not worse than the rest": 1.33:1 now against 1.16:1 before, and both are
	// far under any floor. Fixing it means changing how `Button` dims, which is
	// out of scope here — pinned so a reviewer sees the number, not a promise.
	const dimmed = (fill: string, label: string) =>
		contrast(
			compositeOver(
				`${label}80`,
				compositeOver(`${fill}80`, light.card as string),
			),
			light.card as string,
		);
	const before = dimmed(light.success, light.primaryForeground);
	const after = dimmed(light.successAction, light.successActionForeground);
	expect(before).toBeCloseTo(1.156, 2);
	expect(after).toBeCloseTo(1.327, 2);
	expect(after).toBeGreaterThan(before);
	expect(after).toBeLessThan(4.5);
});

test("dark is byte-identical to the fills it replaces, so half the users see no change", () => {
	expect(dark.successAction).toBe(dark.success);
	expect(dark.successActionForeground).toBe(dark.primaryForeground);
	expect(dark.infoAction).toBe(dark.info);
	expect(dark.infoActionForeground).toBe(dark.primaryForeground);
});
