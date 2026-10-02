import { expect, test } from "bun:test";
import { authorPalette, light, dark } from "@/src/core/theme/colors";
import { contrast } from "@/src/test-utils/contrast";

/**
 * The review-author disc: the fill, and the glyph painted on it.
 *
 * Two measured floors, and the reason the palette stores a `{ fill, on }` pair
 * instead of a bare colour:
 *
 * - `on` over `fill` at the 4.5:1 text floor. The glyph is a `User` icon and,
 *   when real initials land, text — either way it is not decorative, and it
 *   carries no adjacent label to compensate for it.
 * - `fill` against the surfaces the disc is painted on at the 3:1 non-text
 *   floor. A 36px disc with no border must separate from what is behind it, or
 *   the boundary that makes it a disc disappears.
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

test("the palette is not empty and carries a pair per slot", () => {
	for (const scheme of ["light", "dark"] as const) {
		expect(authorPalette[scheme].length).toBeGreaterThan(0);
		for (const entry of authorPalette[scheme]) {
			expect(entry.fill).toMatch(/^#[0-9A-F]{6}$/);
			expect(entry.on).toMatch(/^#[0-9A-F]{6}$/);
		}
	}
});
