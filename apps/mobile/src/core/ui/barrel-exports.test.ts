import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The `@/src/core/ui` barrel re-exports RUNTIME VALUES, and this app has 18
 * partial `mock.module("@/src/core/ui", …)` stubs. bun checks nominal imports,
 * so the moment a component pulls a *value* the stub happens not to declare,
 * the test dies with `Export named 'X' not found` — a failure that points at
 * the test instead of at the export that caused it.
 *
 * That is not hypothetical: `badgeToneColors` was added to the barrel as a
 * runtime value and immediately broke a stub that had no reason to know about
 * it. The fix was to import it from `@/src/core/ui/badge-tone` by leaf path and
 * drop the barrel export, like `AppText`, `SegmentedTabs`, `Navbar`,
 * `InfoScreen` and `tabbar-store` already do.
 *
 * This guard does not pretend to stop mock breakage — the test suite already
 * does that, loudly. It makes the DECISION explicit: a value re-export cannot
 * be added to the barrel silently. Whoever adds one has to list it here, in
 * the same PR, with a reason. That is the conversation this file exists to
 * force, and it is the same bargain `theme/success-text.purity.test.ts` strikes
 * for the decorative success token.
 *
 * TYPE re-exports are deliberately not guarded: `import type` is erased at
 * compile time, so a stub can never be broken by one.
 */

const UI_DIR = join(import.meta.dir);
const BARREL = join(UI_DIR, "index.tsx");
const source = readFileSync(BARREL, "utf8");

/** Every value re-exported from a sibling module, as `module:name`. */
function valueReExports(): string[] {
	const out: string[] = [];
	// `[^}]*` spans newlines, so a multi-line re-export block matches too.
	for (const match of source.matchAll(
		/export\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["']/g,
	)) {
		const [, specifiers, module] = match;
		for (const raw of specifiers.split(",")) {
			const spec = raw
				.trim()
				.replace(/\/\/.*$/, "")
				.trim();
			if (!spec) continue;
			// `type Foo` and `{ type Foo }` are erased at compile time: not a value.
			if (/^type\s/.test(spec)) continue;
			// `default as Navbar` exports the name `Navbar`; `default as` is source
			// syntax, not part of the exported binding.
			const name = spec.replace(/^default\s+as\s+/, "").trim();
			out.push(`${module}:${name}`);
		}
	}
	return out.sort();
}

/**
 * Value re-exports the barrel is allowed to carry, and why each is safe.
 *
 * A component or a primitive that screens import by name is the barrel's whole
 * job, and every existing stub that loads one already declares it. A NEW entry
 * is a claim that consumers can keep importing it from the barrel without
 * widening the surface any partial mock has to satisfy — justify it there.
 */
const ALLOWED: Record<string, string> = {
	"./BottomSheetModal:BottomSheetModal":
		"modal primitive; stubs that render it already declare it",
	"./AppText:AppText": "the text primitive every screen builds on",
	"./WebPullToRefresh:useWebPullToRefresh":
		"hook paired with the pull component; no consumer stubs the barrel around it",
	"./Logo:Logo":
		"brand primitive, imported by name from the auth and consumer layouts",
	"./Navbar:Navbar": "shared chrome, imported by name from both tab layouts",
	"./Navbar:BAR_HEIGHT":
		"travels with Navbar; a screen sizing against it needs both",
};

/** Resolves `./Name` to the sibling file that declares it. */
function resolveSibling(module: string): string | null {
	for (const ext of [".tsx", ".ts"]) {
		const candidate = join(UI_DIR, `${module.slice(2)}${ext}`);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

const reExports = valueReExports();

describe("UI barrel value re-exports", () => {
	test("every one of them is on the allowlist", () => {
		const unlisted = reExports.filter((entry) => !ALLOWED[entry]);
		expect(unlisted).toEqual([]);
	});

	test("no stale allowlist entry (the symbol left the barrel)", () => {
		expect(Object.keys(ALLOWED).filter((e) => !reExports.includes(e))).toEqual(
			[],
		);
	});

	test("no blank cheque (the entry excuses a symbol that no longer exists)", () => {
		// Without this an entry outlives its symbol and silently permits the next
		// unrelated export to reuse the same `module:name` slot forever.
		const excusingNothing = Object.keys(ALLOWED).filter((entry) => {
			const [module, name] = entry.split(":");
			const file = resolveSibling(module);
			if (!file) return true;
			const text = readFileSync(file, "utf8");
			return !new RegExp(
				`export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|class|type|interface)\\s+${name}\\b`,
			).test(text);
		});
		expect(excusingNothing).toEqual([]);
	});
});

describe("the badge-tone module specifically", () => {
	test("stays out of the barrel as a value", () => {
		// The regression this file exists because of. `BadgeTone` (the type) may
		// and does stay; the function may not.
		expect(reExports.filter((e) => e.startsWith("./badge-tone:"))).toEqual([]);
	});

	test("is still re-exported as a type, which mocks cannot break", () => {
		expect(source).toContain('export type { BadgeTone } from "./badge-tone";');
	});

	test("consumers import the helper by leaf path", () => {
		const orderCard = join(
			UI_DIR,
			"..",
			"..",
			"features",
			"orders",
			"components",
			"OrderCard.tsx",
		);
		const text = readFileSync(orderCard, "utf8");
		expect(text).toContain('from "@/src/core/ui/badge-tone"');
		expect(text).not.toMatch(
			/import\s*\{[^}]*\bbadgeToneColors\b[^}]*\}\s*from\s*["']@\/src\/core\/ui["']/,
		);
	});
});
