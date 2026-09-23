import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { ICON_INNER, ICON_SVG, ICON_VIEWBOX } from "../icon";
import {
	MARK_FULL_INNER,
	MARK_FULL_SVG,
	MARK_FULL_VIEWBOX,
	MARK_R_D,
	MARK_R_TRANSFORM,
	MARK_R_VIEWBOX,
} from "../mark";
import { BRAND_TARGETS } from "../manifest";
import {
	BRAND_ACCENT,
	BRAND_ACCENT_LIGHT,
	BRAND_ASSET_VERSION,
	BRAND_CREAM,
	BRAND_PAPER,
	BRAND_PRIMARY,
	BRAND_PRIMARY_DARK,
} from "../tokens";
import {
	WORDMARK_INNER,
	WORDMARK_MONO_INNER,
	WORDMARK_MONO_SVG,
	WORDMARK_SVG,
	WORDMARK_VIEWBOX,
	WORDMARK_WHITE_INNER,
	WORDMARK_WHITE_SVG,
} from "../wordmark";

const HEX = /^#[0-9A-Fa-f]{6}$/;
const here = dirname(fileURLToPath(import.meta.url));

describe("brand single source of truth", () => {
	test("tokens are valid hex colors", () => {
		for (const c of [
			BRAND_PRIMARY,
			BRAND_PRIMARY_DARK,
			BRAND_PAPER,
			BRAND_CREAM,
			BRAND_ACCENT,
		]) {
			expect(c).toMatch(HEX);
		}
	});

	test("generated modules match the canonical assets", () => {
		const icon = readFileSync(join(here, "..", "assets", "icon.svg"), "utf8");
		const wordmark = readFileSync(
			join(here, "..", "assets", "wordmark.svg"),
			"utf8",
		);
		expect(icon).toContain(`viewBox="${ICON_VIEWBOX}"`);
		expect(wordmark).toContain(`viewBox="${WORDMARK_VIEWBOX}"`);
		expect(wordmark).toContain(WORDMARK_INNER.slice(0, 80));
		// icon.ts carries the transparent treatment: same viewBox, cream
		// background rect removed, artwork kept.
		expect(ICON_INNER).not.toContain("#FCFBF3");
		expect(ICON_INNER).toContain("#311743");
		expect(ICON_SVG).toContain(ICON_VIEWBOX);
		expect(WORDMARK_SVG).toContain(WORDMARK_VIEWBOX);
	});

	test("lone R mark is reframed inside the canvas", () => {
		const [x, y, w, h] = MARK_R_VIEWBOX.split(" ").map(Number);
		for (const n of [x, y, w, h]) {
			expect(Number.isFinite(n)).toBe(true);
		}
		expect(w).toBeGreaterThan(0);
		expect(h).toBeGreaterThan(0);
		expect(x).toBeGreaterThanOrEqual(0);
		expect(y).toBeGreaterThanOrEqual(0);
		expect(x + w).toBeLessThanOrEqual(1024);
		expect(y + h).toBeLessThanOrEqual(1024);
		expect(MARK_R_D.startsWith("m") || MARK_R_D.startsWith("M")).toBe(true);
		expect(
			MARK_R_TRANSFORM === null || typeof MARK_R_TRANSFORM === "string",
		).toBe(true);
	});

	test("full logo mark is transparent and tintable", () => {
		const [x, y, w, h] = MARK_FULL_VIEWBOX.split(" ").map(Number);
		for (const n of [x, y, w, h]) {
			expect(Number.isFinite(n)).toBe(true);
		}
		expect(w).toBeGreaterThan(0);
		expect(h).toBeGreaterThan(0);
		expect(x).toBeGreaterThanOrEqual(0);
		expect(y).toBeGreaterThanOrEqual(0);
		expect(x + w).toBeLessThanOrEqual(1024);
		expect(y + h).toBeLessThanOrEqual(1024);
		// Tile and counter punch (BRAND_PRIMARY_DARK) are dropped: the mark
		// sits directly on the host background.
		expect(MARK_FULL_INNER).not.toContain(BRAND_PRIMARY_DARK);
		// Sparkles keep their brand fill; the R tints through currentColor.
		expect(MARK_FULL_INNER).toContain(BRAND_ACCENT_LIGHT);
		expect(MARK_FULL_INNER).toContain("currentColor");
		expect(MARK_FULL_SVG).toContain(MARK_FULL_VIEWBOX);
	});

	test("white wordmark maps every fill to paper", () => {
		expect(WORDMARK_WHITE_INNER).not.toContain("#371949");
		expect(WORDMARK_WHITE_INNER).not.toContain("#B582E4");
		expect(WORDMARK_WHITE_INNER).not.toContain("#CD9DFA");
		expect(WORDMARK_WHITE_INNER).toContain(BRAND_PAPER);
		expect(WORDMARK_WHITE_SVG).toContain(WORDMARK_VIEWBOX);
	});

	test("monochrome wordmark uses only currentColor", () => {
		expect(WORDMARK_MONO_INNER).toContain("currentColor");
		expect(WORDMARK_MONO_INNER).not.toMatch(/#[0-9A-Fa-f]{6}/);
		expect(WORDMARK_MONO_SVG).toContain(WORDMARK_VIEWBOX);
	});

	test("manifest lists every generated destination", () => {
		const files = BRAND_TARGETS.map((t) => t.file);
		for (const f of [
			"apps/admin/public/icon.svg",
			"apps/landing/public/icon.svg",
			"apps/mobile/assets/svgs/role_wordmark.svg",
			"apps/landing/public/wordmark.svg",
			"apps/admin/public/wordmark.svg",
		]) {
			expect(files).toContain(f);
		}
	});

	test("asset version is a positive integer", () => {
		expect(Number.isInteger(BRAND_ASSET_VERSION)).toBe(true);
		expect(BRAND_ASSET_VERSION).toBeGreaterThan(0);
	});
});
