import { expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The `warning` and `info` families each have two tokens with one job each:
 *
 * - `warning` (#F59E0B) / `info` (#0D9488 light, #2DD4BF dark) — decorative:
 *   washes, fills, borders, glows, status dots. 1.96:1 and 3.42:1 on light
 *   `card`, so neither can reach a text or glyph foreground on a light surface.
 * - `warningText` / `infoText` — foregrounds only.
 * - `successAction` / `infoAction` — solid fills only, and only for the order
 *   flow's primary action and the OrderCard progress circles.
 *
 * These are source-level guards, not render assertions: they catch the class of
 * regression where a new screen reaches for the decorative hue again. The
 * allowlist is keyed per LINE, not per file, so a decorative entry can never
 * become a blanket excuse for a text use on a neighbouring line of the same
 * file — the weakness a per-file allowlist leaves open. A reviewer adding a
 * foreground has to add a line entry in the same PR, which is exactly the
 * conversation this file exists to force.
 *
 * `success` has its own guard in `success-text.purity.test.ts`.
 */

const APP = join(import.meta.dir, "..", "..", "..");

/** Every app source root. `components/` and `lib/` sit beside `src/`, not in it. */
const ROOTS = ["src", "app", "components", "lib"];

/** Walks app source, skipping build output and the specs themselves. */
function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		if (entry === "node_modules" || entry === ".expo" || entry === "dist")
			return [];
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
	});
}

const files = ROOTS.flatMap((root) => sourceFiles(join(APP, root)));
const rel = (file: string) => file.slice(APP.length + 1);

/** Trims a trailing line comment so prose about a token does not trip a guard. */
function stripProse(line: string): string {
	return line.replace(/\/\/.*$/, "");
}

/**
 * The source with every block comment blanked and every line comment trimmed, so
 * a guard can assert "no call site" without a doc comment that quotes a token
 * counting as one. One entry per source line, so the line numbers this file
 * reports still point at the real line.
 */
function codeLines(file: string): string[] {
	return readFileSync(file, "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
		.split("\n")
		.map(stripProse);
}

interface AllowedSite {
	/** A distinctive fragment of the single line this entry excuses. */
	line: string;
	why: string;
}

/**
 * Every remaining `colors.warning` / `colors.info` site and why the decorative
 * hue is correct there. All of them are a background, a border, a glow or a
 * status dot — except the landing hero, which is a text foreground that is
 * already compliant on the surface it actually sits on (see
 * `semantic-text.contrast.test.ts` for the measurement).
 */
const ALLOWED: Record<string, AllowedSite[]> = {
	"app/business/[id]/locations/[locationId].tsx": [
		{
			line: "withAlpha(colors.warning, 0.149)",
			why: "headquarters chip wash over card; the star and the label inside it use warningText",
		},
	],
	"app/landing/index.tsx": [
		{
			line: "style={{ color: colors.warning }}",
			why: "hero word on colors.primary: 7.00:1 at h1/24px/800, so the large-text 3:1 floor applies and it passes. warningText would be 2.90:1, a regression",
		},
	],
	"components/ui/alert.tsx": [
		{
			line: "borderColor: withAlpha(colors.warning, 0.35)",
			why: "Alert warning hairline over surfaceWarning; the icon inside it uses warningText",
		},
	],
	"src/features/business/components/orders/OrdersFiltersControl.tsx": [
		{
			line: "return colors.warning;",
			why: "status dot fill; the adjacent text label carries the meaning",
		},
		{
			line: "return colors.info;",
			why: "status dot fill; the adjacent text label carries the meaning",
		},
	],
	"src/features/business/components/products/ProductDetail.tsx": [
		{
			line: "{ backgroundColor: colors.warning }",
			why: "allergen chip fill, not a foreground",
		},
	],
	"src/features/explore/components/ExploreTipSection.tsx": [
		{
			line: "withAlpha(colors.warning, 0.55)",
			why: "boxShadow glow around the lit bulb; the glyph inside uses warningText",
		},
	],
	"src/features/offers/components/detail/OfferContent.tsx": [
		{
			line: "{ backgroundColor: colors.warning }",
			why: "allergen chip fill, not a foreground",
		},
	],
};

const DECORATIVE = /colors\.(warning|info)\b/;
const offenders: string[] = [];
const allowedHits = new Map<string, number>();

for (const file of files) {
	const entries = ALLOWED[rel(file)] ?? [];
	readFileSync(file, "utf8")
		.split("\n")
		.forEach((raw, index) => {
			const line = stripProse(raw);
			if (!DECORATIVE.test(line)) return;
			const match = entries.find((entry) => line.includes(entry.line));
			if (!match) {
				offenders.push(`${rel(file)}:${index + 1} ${raw.trim()}`);
				return;
			}
			allowedHits.set(
				`${rel(file)}|${match.line}`,
				(allowedHits.get(`${rel(file)}|${match.line}`) ?? 0) + 1,
			);
		});
}

test("no screen uses the decorative warning or info token as a foreground", () => {
	expect(offenders).toEqual([]);
});

test("every allowed decorative site matches exactly one line, and no more", () => {
	// A duplicated or widened fragment would quietly excuse a second site, which
	// is the loophole a per-file allowlist leaves open.
	const counts: Record<string, number> = {};
	for (const [key, count] of allowedHits) counts[key] = count;
	const expected: Record<string, number> = {};
	for (const [file, entries] of Object.entries(ALLOWED)) {
		for (const entry of entries) expected[`${file}|${entry.line}`] = 1;
	}
	expect(counts).toEqual(expected);
});

test("every allowlist entry is still on disk and still documented", () => {
	const onDisk = new Set(files.map(rel));
	const stale = Object.entries(ALLOWED)
		.filter(([file]) => !onDisk.has(file))
		.map(([file]) => file);
	expect(stale).toEqual([]);
	for (const entries of Object.values(ALLOWED)) {
		for (const entry of entries) {
			expect(entry.why.length).toBeGreaterThan(20);
		}
	}
});

test("warningDark has no call sites left", () => {
	// The Alert warning icon used to be `scheme === "dark" ? warning :
	// warningDark`; `warningText` is that decision, resolved once in the palette.
	expect(
		files.filter((file) =>
			codeLines(file).some((line) => line.includes("colors.warningDark")),
		),
	).toEqual([]);
});

test("no scheme ternary picks a warning or info foreground any more", () => {
	const ternaries = files.filter((file) =>
		/scheme\s*===\s*["']dark["']\s*\?\s*[^:]*colors\.(warning|info)\b/.test(
			codeLines(file).join("\n"),
		),
	);
	expect(ternaries).toEqual([]);
});

test("the text-safe tokens never become a background", () => {
	// Foreground-only by contract: if one of these ever shows up as a fill it is a
	// decorative use that belongs on the plain token instead.
	const asFill = files.filter((file) =>
		codeLines(file).some((line) =>
			/backgroundColor:[^\n]*colors\.(warningText|infoText|successText)\b/.test(
				line,
			),
		),
	);
	expect(asFill).toEqual([]);
});

const ACTION_FILES = [
	"src/features/business/components/orders/OrderActionButtons.tsx",
	"src/features/orders/components/OrderCard.tsx",
];

test("the solid action tokens live only in the order flow", () => {
	const wrongFile = files.filter(
		(file) =>
			codeLines(file).some((line) =>
				/colors\.(successAction|infoAction)\b/.test(line),
			) && !ACTION_FILES.includes(rel(file)),
	);
	expect(wrongFile.map(rel).sort()).toEqual([]);
});

test("the action labels are bound to their paired foreground token, not primaryForeground", () => {
	// `primaryForeground` is right on every other surface in the app; on a green
	// or teal fill it is the defect this split exists to remove.
	const bindings: Array<[string, string, boolean]> = [
		[ACTION_FILES[0] as string, "colors.infoActionForeground", true],
		[ACTION_FILES[0] as string, "colors.successActionForeground", true],
		// The OrderCard glyph reads `? colors.successActionForeground` inside a
		// `const iconColor =` ternary, so only presence is checkable here; the
		// rendered pairing is asserted in the order action render spec.
		[ACTION_FILES[1] as string, "colors.successActionForeground", false],
	];
	for (const [file, token, onColourProp] of bindings) {
		const lines = codeLines(join(APP, file));
		expect(lines.some((line) => line.includes(token))).toBe(true);
		if (onColourProp) {
			expect(
				lines.some((line) => new RegExp(`color[:=]\\s*${token}\\b`).test(line)),
			).toBe(true);
		}
	}
	// The teal button was the last thing in the order flow still borrowing
	// `primaryForeground`; nothing in that file should reach for it now.
	const borrowing = codeLines(join(APP, ACTION_FILES[0] as string)).filter(
		(line) => line.includes("colors.primaryForeground"),
	);
	expect(borrowing).toEqual([]);
});

test("a fill token never lands on a colour prop and a foreground token never lands on a fill", () => {
	// Lexically checkable because every one of these sites binds the token to an
	// explicit `color` / `backgroundColor` prop. The OrderCard ternaries read
	// `? colors.successAction`, so their role is proven by the render spec.
	const fillAsForeground: string[] = [];
	const foregroundAsFill: string[] = [];
	for (const file of ACTION_FILES) {
		codeLines(join(APP, file)).forEach((line) => {
			if (/color[:=]\s*colors\.(successAction|infoAction)\b/.test(line))
				fillAsForeground.push(`${file}: ${line.trim()}`);
			if (
				/backgroundColor:\s*colors\.(successAction|infoAction)Foreground\b/.test(
					line,
				)
			)
				foregroundAsFill.push(`${file}: ${line.trim()}`);
		});
	}
	expect(fillAsForeground).toEqual([]);
	expect(foregroundAsFill).toEqual([]);
});
