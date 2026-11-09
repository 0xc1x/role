/**
 * Web hand-off of the browser chrome (safe areas) to the app theme.
 *
 * The static `theme-color` meta is the LAUNCH canvas colour (morado): it is
 * what paints Android's status bar / nav bar and the desktop PWA window frame
 * while the native or boot splash is up, so it must stay purple during boot —
 * the launch canvas is purple and a bar of another colour mid-splash is the
 * seam this module exists to avoid. Once the app is revealed, the chrome has
 * to match the theme background instead, the same contract `--page-background`
 * already honors for the canvas.
 *
 * HTML cannot resolve this alone: the app has a persisted light/dark/system
 * preference, so no static media query can speak for the resolved theme. The
 * two parties meet here:
 *
 *   - ThemeProvider → `sync(resolved)`: remembers the resolved scheme and
 *     repaints the meta only after the hand-off has happened.
 *   - Root layout (boot splash removal) → `begin()`: flips the hand-off and
 *     applies what it knows — the scheme ThemeProvider already solved, or the
 *     CSS var the shell painted with if it is the one who got there first.
 *
 * Native platforms are unaffected: Android paints the system chrome from the
 * same tokens (`SystemUI.setBackgroundColorAsync`) and iOS reserves the safe
 * pixels to the page.
 */
import { colorTokens, type ThemeScheme } from "./colors";

interface MinimalDocument {
	querySelector: (
		selector: string,
	) => null | { setAttribute: (name: string, value: string) => void };
	documentElement: {
		style?: { getPropertyValue: (name: string) => string };
	};
}

export interface PageChrome {
	/** ThemeProvider: track the resolved scheme; applies after the hand-off. */
	sync(resolved: ThemeScheme): void;
	/** Reveal moment (boot splash removal): activate the hand-off. */
	begin(): void;
}

export function createPageChrome({
	colorTokens,
	document: doc,
}: {
	colorTokens: Record<ThemeScheme, { background: string }>;
	document: MinimalDocument;
}): PageChrome {
	let active = false;
	let resolved: ThemeScheme | null = null;

	function apply(content: string) {
		if (!doc) return;
		doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", content);
	}

	return {
		sync(next) {
			resolved = next;
			if (!active) return;
			apply(colorTokens[next].background);
		},
		begin() {
			if (active) return;
			active = true;
			if (resolved) {
				apply(colorTokens[resolved].background);
				return;
			}
			// ThemeProvider has not resolved yet (rare: the 6s splash watchdog
			// fired before hydration). Do not blank the meta — an empty/missing
			// content is worse than keeping the launch colour — only apply the
			// var when the shell actually declared it inline.
			const value = doc?.documentElement.style
				?.getPropertyValue("--page-background")
				.trim();
			if (value) apply(value);
		},
	};
}

/** App singleton. Native never calls it: every call site is web-gated. */
export const pageChrome = createPageChrome({
	colorTokens,
	document: globalThis.document,
});
