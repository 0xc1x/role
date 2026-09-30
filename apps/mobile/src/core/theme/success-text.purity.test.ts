import { expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The `success` family has three tokens and each has one job:
 *
 * - `success` (#22C55E, both schemes) — decorative only: washes, fills,
 *   progress connectors, status dots. 2.08:1 on light `card`, so it must never
 *   reach a text or glyph foreground on a light surface.
 * - `successText` — the only token allowed as a foreground.
 * - `successDark` (#15803D) — no call sites left; the scheme ternary it needed
 *   is gone.
 *
 * These are source-level guards, not render assertions: they catch the class of
 * regression where a new screen reaches for the decorative hue again. A reviewer
 * adding a `success` foreground has to update `ALLOWED` in the same PR, which
 * is exactly the conversation this test exists to force.
 */

const APP = join(import.meta.dir, "..", "..", "..");

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

// `components/` and `lib/` sit beside `src/`, not inside it, and the shadcn port
// in `components/ui/alert.tsx` is exactly where a semantic foreground would
// creep back in — so the walk covers every app source root, not two of them.
const files = ["src", "app", "components", "lib"].flatMap((root) =>
	sourceFiles(join(APP, root)),
);
const rel = (file: string) => file.slice(APP.length + 1);

/**
 * Every remaining `colors.success` site and why the decorative hue is correct
 * there. All of them are either a background/fill, or a foreground sitting on a
 * scheme-invariant near-black surface where `success` measures 7.6:1 and
 * `successText` would drop to 3.5:1.
 */
const ALLOWED: Record<string, string> = {
	"app/business/[id]/payouts/[payoutId].tsx":
		"hero foreground on colors.ink (#1A1A18) in both schemes: 7.65:1",
	"src/features/business/components/orders/OrdersFiltersControl.tsx":
		"status dot fill; the adjacent text label carries the meaning",
	"src/features/business/components/orders/PickupScannerSheet.tsx":
		"glyph on a 54% scrim over the camera: scheme-invariant dark surface",
	"src/features/orders/components/OrderCard.tsx":
		"progress connector fill only; the done circle is successAction so its glyph has a foreground",
	"src/features/orders/components/order-detail/OrderProgressHeader.tsx":
		"progress circle fill and connector fill, not text",
	"src/features/offers/components/detail/OfferContent.tsx":
		"withAlpha(success, 0.102) pill wash; its amount text uses successText",
};

const offenders: string[] = [];
for (const file of files) {
	if (ALLOWED[rel(file)]) continue;
	readFileSync(file, "utf8")
		.split("\n")
		.forEach((line, index) => {
			// Strip line comments so prose about the token does not trip the guard.
			if (/colors\.success\b/.test(line.replace(/\/\/.*$/, ""))) {
				offenders.push(`${rel(file)}:${index + 1} ${line.trim()}`);
			}
		});
}

test("no screen uses the decorative success token as a foreground", () => {
	expect(offenders).toEqual([]);
});

test("every allowed success site is still on disk (no stale allowlist entry)", () => {
	const onDisk = new Set(files.map(rel));
	const stale = Object.keys(ALLOWED).filter((file) => !onDisk.has(file));
	expect(stale).toEqual([]);
});

test("every allowed success site still has a `colors.success` to excuse", () => {
	// Without this, an allowlist entry for a file that no longer uses the token
	// becomes a permanent blank cheque: any future `colors.success` in that file
	// would be waved through. The order action buttons lost theirs when the fill
	// moved to `successAction`, and the entry went with it.
	const excusingNothing = Object.keys(ALLOWED).filter(
		(file) => !/colors\.success\b/.test(readFileSync(join(APP, file), "utf8")),
	);
	expect(excusingNothing).toEqual([]);
});

test("successDark has no call sites left", () => {
	expect(
		files.filter((file) =>
			readFileSync(file, "utf8").includes("colors.successDark"),
		),
	).toEqual([]);
});

test("the success scheme ternary is gone from the app", () => {
	const ternaries = files.filter((file) =>
		/scheme\s*===\s*["']dark["']\s*\?\s*[^:]*colors\.success\b/.test(
			readFileSync(file, "utf8"),
		),
	);
	expect(ternaries).toEqual([]);
});
