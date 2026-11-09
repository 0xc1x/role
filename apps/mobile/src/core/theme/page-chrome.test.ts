import { describe, expect, test } from "bun:test";

import { createPageChrome } from "./page-chrome";
import { colorTokens } from "./colors";

/**
 * Fixture document: the meta is the only live element, the shell var is
 * configurable so the watchdog path can be exercised with and without it.
 */
function documentFixture(inlinePageBackground?: string) {
	const meta = {
		content: null as string | null,
		setAttribute(name: string, value: string) {
			if (name !== "content") throw new Error(`unexpected attribute: ${name}`);
			this.content = value;
		},
	};
	const doc = {
		querySelector: (selector: string) =>
			selector === 'meta[name="theme-color"]' ? meta : null,
		documentElement: {
			style: {
				getPropertyValue: (name: string) =>
					name === "--page-background" ? (inlinePageBackground ?? "") : "",
			},
		},
	};
	return { meta, doc };
}

function createChrome(doc: ReturnType<typeof documentFixture>["doc"]) {
	return createPageChrome({
		colorTokens,
		document: doc,
	});
}

describe("page chrome hand-off", () => {
	test("keeps the launch colour until the hand-off", () => {
		const { meta, doc } = documentFixture("#FBFAFD");
		const chrome = createChrome(doc);
		chrome.sync("dark");
		// ThemeProvider resolved the scheme but the boot splash is still up:
		// the static meta (launch canvas colour) must not be repainted.
		expect(meta.content).toBeNull();
	});

	test("applies the resolved scheme the moment the hand-off happens", () => {
		const { meta, doc } = documentFixture("#FBFAFD");
		const chrome = createChrome(doc);
		chrome.sync("dark");
		chrome.begin();
		expect(meta.content).toBe(colorTokens.dark.background);
		// Persisted preference change after the reveal keeps the chrome in
		// sync immediately.
		chrome.sync("light");
		expect(meta.content).toBe(colorTokens.light.background);
	});

	test("double begin is a no-op", () => {
		const { meta, doc } = documentFixture("#FBFAFD");
		const chrome = createChrome(doc);
		chrome.begin();
		expect(meta.content).toBe("#FBFAFD"); // shell var fallback
		chrome.sync("dark");
		expect(meta.content).toBe(colorTokens.dark.background);
		chrome.begin();
		// The second begin must not resurrect anything behind the sync.
		expect(meta.content).toBe(colorTokens.dark.background);
	});

	test("never blanks the meta when the shell var is missing", () => {
		const { meta, doc } = documentFixture();
		const chrome = createChrome(doc);
		chrome.begin();
		// No resolved scheme AND no inline var: keep the launch colour rather
		// than painting an empty content attribute.
		expect(meta.content).toBeNull();
	});
});
