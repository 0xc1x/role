import { expect, test } from "bun:test";
import { authorPalette, light, dark } from "@/src/core/theme/colors";
import {
	chroma,
	contrast,
	deltaE,
	hueDistance,
} from "@/src/test-utils/contrast";

/**
 * The review-author disc: the fill, and the glyph painted on it.
 *
 * Three measured floors, and the reason the palette stores a `{ fill, on }` pair
 * instead of a bare colour:
 *
 * - `on` over `fill` at the 4.5:1 text floor. The glyph is a `User` icon and,
 *   when real initials land, text — either way it is not decorative, and it
 *   carries no adjacent label to compensate for it.
 * - `fill` against the surfaces the disc is painted on at the 3:1 non-text
 *   floor. A 36px disc with no border must separate from what is behind it, or
 *   the boundary that makes it a disc disappears.
 * - every PAIR of fills separated in CIELAB at ΔE >= 25. This one exists
 *   because the other two are not enough: the first 8-colour palette cleared
 *   every contrast ratio above and still carried two oranges 23/255 apart,
 *   which no viewer could tell apart. A palette whose colours all pass
 *   contrast can still fail entirely at its only job.
 *
 * Every number is asserted at real precision, and a value short of a floor is
 * asserted AT the floor it misses rather than rounded up into a pass. Fixing a
 * failure means changing the hex in `colors.ts` — not this file.
 */

/** Surfaces a review row is painted on, per call site (`ReviewItem`). */
const LIGHT_SURFACES = ["card", "background", "muted", "surfaceMuted"] as const;
const DARK_SURFACES = ["card", "background", "muted", "popover"] as const;

const TEXT_FLOOR = 4.5;
const NON_TEXT_FLOOR = 3;

test("the glyph is text-safe on every disc in both schemes", () => {
	for (const scheme of ["light", "dark"] as const) {
		for (const [index, entry] of authorPalette[scheme].entries()) {
			const ratio = contrast(entry.fill, entry.on);
			expect(ratio >= TEXT_FLOOR ? ratio : TEXT_FLOOR).toBeGreaterThanOrEqual(
				TEXT_FLOOR,
			);
			// Named so a failure says WHICH disc broke, not just that one did.
			if (ratio < TEXT_FLOOR) {
				throw new Error(
					`${scheme}[${index}] ${entry.fill} on ${entry.on} = ${ratio.toFixed(2)}:1`,
				);
			}
		}
	}
});

test("every disc separates from the light surfaces behind it", () => {
	for (const [index, entry] of authorPalette.light.entries()) {
		for (const key of LIGHT_SURFACES) {
			const ratio = contrast(entry.fill, light[key]);
			if (ratio < NON_TEXT_FLOOR) {
				throw new Error(
					`light[${index}] ${entry.fill} on ${key} (${light[key]}) = ${ratio.toFixed(2)}:1`,
				);
			}
			expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
		}
	}
});

test("every disc separates from the dark surfaces behind it", () => {
	for (const [index, entry] of authorPalette.dark.entries()) {
		for (const key of DARK_SURFACES) {
			const ratio = contrast(entry.fill, dark[key]);
			if (ratio < NON_TEXT_FLOOR) {
				throw new Error(
					`dark[${index}] ${entry.fill} on ${key} (${dark[key]}) = ${ratio.toFixed(2)}:1`,
				);
			}
			expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
		}
	}
});

/**
 * The failure this palette exists to prevent: taking the light fills into dark
 * unchanged. They measure 2.0-2.8:1 on the dark `card` and the disc vanishes.
 */
test("no light fill is reused verbatim in dark", () => {
	const lightFills = new Set(authorPalette.light.map((e) => e.fill));
	for (const entry of authorPalette.dark) {
		expect(lightFills.has(entry.fill)).toBe(false);
	}
});

/**
 * The floor that would have caught the two oranges. ΔE 25 is roughly "an
 * obvious difference at a glance"; below ~10 two fills are indistinguishable
 * side by side, which is what a 36px disc in a scrolling list amounts to.
 */
const MIN_DELTA_E = 25;

test("no two discs in a scheme are close enough to be mistaken for one another", () => {
	for (const scheme of ["light", "dark"] as const) {
		const fills = authorPalette[scheme].map((entry) => entry.fill);
		for (let i = 0; i < fills.length; i++) {
			for (let j = i + 1; j < fills.length; j++) {
				const distance = deltaE(fills[i] as string, fills[j] as string);
				if (distance < MIN_DELTA_E) {
					throw new Error(
						`${scheme}[${i}] ${fills[i]} vs [${j}] ${fills[j]}: ΔE ${distance.toFixed(1)} < ${MIN_DELTA_E}`,
					);
				}
			}
		}
	}
});

/** The search that produced the palette maximised this; assert we still have it. */
test("the palette fills every slot it claims to", () => {
	for (const scheme of ["light", "dark"] as const) {
		expect(authorPalette[scheme].length).toBeGreaterThanOrEqual(16);
	}
});

/**
 * Switching the app between light and dark must not change who a person is.
 * Slot 3 is slot 3 in both schemes — the same `user_id` resolves to the same
 * index — so if the two lists disagree about the HUE, the same reviewer turns
 * cyan into red on a theme switch. Lightness and chroma have to change to
 * clear the contrast floors; hue must not.
 *
 * 12 degrees is roughly where two hues stop reading as "the same colour, lit
 * differently". The palette's worst pair measures under 1.2.
 */
const MAX_HUE_DRIFT = 12;

test("a slot keeps its hue across themes", () => {
	const lightFills = authorPalette.light.map((e) => e.fill);
	const darkFills = authorPalette.dark.map((e) => e.fill);
	for (let i = 0; i < lightFills.length; i++) {
		const a = lightFills[i] as string;
		const b = darkFills[i] as string;
		if (b === undefined) continue;
		const drift = hueDistance(a, b);
		if (drift > MAX_HUE_DRIFT) {
			throw new Error(
				`slot ${i}: ${a} vs ${b} drift ${drift.toFixed(1)}° > ${MAX_HUE_DRIFT}°`,
			);
		}
		expect(drift).toBeLessThanOrEqual(MAX_HUE_DRIFT);
	}
});

/**
 * Hue is only meaningful above some chroma: on a near-grey fill the angle is
 * rounding noise, so a low-chroma slot would "hold its hue" trivially while
 * showing nothing to recognise. Floor is well under the palette's own range.
 */
test("no slot is too washed out to have a hue worth keeping", () => {
	for (const scheme of ["light", "dark"] as const) {
		for (const [index, entry] of authorPalette[scheme].entries()) {
			const value = chroma(entry.fill);
			if (value < 25) {
				throw new Error(
					`${scheme}[${index}] ${entry.fill} chroma ${value.toFixed(0)} < 25`,
				);
			}
			expect(value).toBeGreaterThanOrEqual(25);
		}
	}
});

test("the palette is not empty and carries a pair per slot", () => {
	for (const scheme of ["light", "dark"] as const) {
		expect(authorPalette[scheme].length).toBeGreaterThan(0);
		for (const entry of authorPalette[scheme]) {
			expect(entry.fill).toMatch(/^#[0-9A-F]{6}$/);
			expect(entry.on).toMatch(/^#[0-9A-F]{6}$/);
		}
	}
});
