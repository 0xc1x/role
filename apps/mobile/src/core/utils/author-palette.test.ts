import { expect, test } from "bun:test";
import { authorDisc, authorPaletteIndex } from "./author-palette";
import { authorPalette } from "@/src/core/theme/colors";

const SIZES = [authorPalette.light.length, authorPalette.dark.length];

/** Deterministic stand-ins for UUIDs: same shape, different content. */
function seeds(count: number): string[] {
	return Array.from({ length: count }, (_, i) => `seed-${i}`);
}

test("the same seed always resolves to the same slot", () => {
	for (const seed of seeds(50)) {
		for (const size of SIZES) {
			expect(authorPaletteIndex(seed, size)).toBe(
				authorPaletteIndex(seed, size),
			);
		}
	}
});

test("every slot is reachable: the index spans the whole palette", () => {
	for (const size of SIZES) {
		const reached = new Set(seeds(200).map((s) => authorPaletteIndex(s, size)));
		expect(reached.size).toBe(size);
	}
});

test("a slot is always inside the palette", () => {
	for (const seed of seeds(500)) {
		for (const size of SIZES) {
			const index = authorPaletteIndex(seed, size);
			expect(index).toBeGreaterThanOrEqual(0);
			expect(index).toBeLessThan(size);
		}
	}
});

/**
 * FNV-1a modulo 8 is not uniform on a small sample, so this asserts the loose
 * property a reviewer cares about — no colour dominates — rather than an exact
 * distribution. `seed-N` strings are more regular than real UUIDs, so the bar
 * is set well under an even split on purpose.
 */
test("no colour takes over: each slot gets a fair share of seeds", () => {
	for (const size of SIZES) {
		const counts = new Array<number>(size).fill(0);
		for (const seed of seeds(2000)) counts[authorPaletteIndex(seed, size)]++;
		const lowest = Math.min(...counts);
		expect(lowest).toBeGreaterThan(2000 / size / 2);
	}
});

test("an empty seed resolves inside the palette rather than throwing", () => {
	// Defensive: `reviews.user_id` is NOT NULL, so this cannot reach the UI.
	// The mapper coerces a missing column to "" rather than null, and a string
	// is what this function is typed for.
	for (const size of SIZES) {
		const index = authorPaletteIndex("", size);
		expect(index).toBeGreaterThanOrEqual(0);
		expect(index).toBeLessThan(size);
	}
});

test("a non-positive palette size does not produce a negative index", () => {
	expect(authorPaletteIndex("seed-1", 0)).toBe(0);
	expect(authorPaletteIndex("seed-1", -3)).toBe(0);
});

test("both schemes carry the same number of slots", () => {
	expect(authorPalette.dark.length).toBe(authorPalette.light.length);
});

test("no slot repeats a fill within a scheme", () => {
	for (const scheme of ["light", "dark"] as const) {
		const fills = authorPalette[scheme].map((entry) => entry.fill);
		expect(new Set(fills).size).toBe(fills.length);
	}
});

test("authorDisc agrees with authorPaletteIndex on every seed", () => {
	for (const seed of seeds(100)) {
		for (const scheme of ["light", "dark"] as const) {
			const palette = authorPalette[scheme];
			const expected = palette[authorPaletteIndex(seed, palette.length)];
			expect(authorDisc(scheme, seed)).toEqual(expected);
		}
	}
});

test("authorDisc never returns undefined, whatever the seed", () => {
	for (const seed of [...seeds(50), "", "   "]) {
		for (const scheme of ["light", "dark"] as const) {
			expect(authorDisc(scheme, seed)).toBeDefined();
			expect(authorDisc(scheme, seed).fill).toMatch(/^#[0-9A-F]{6}$/);
		}
	}
});
