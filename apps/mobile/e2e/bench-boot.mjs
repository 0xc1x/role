/**
 * Boot-mode benchmark: how long does each run mode take to render the
 * consumer home in a real headless browser?
 *
 * Not part of the e2e suite. It exists so the choice between
 * `expo export` (static) and `expo start --web` (Metro) is a measurement
 * and not an opinion.
 *
 * Two numbers per mode, because "the server answered" is not "the user sees
 * the app": the 7.6 MB web bundle has to be parsed and the first screen
 * painted before any of this is evidence.
 */
import { chromium } from "@playwright/test";

const baseURL = process.argv[2];
const label = process.argv[3] ?? baseURL;
const SUPABASE = "https://test.supabase.co";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const consoleErrors = [];
page.on("console", (m) => {
	if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

// Cut every Supabase call at the browser edge: the e2e never talks to a real
// backend, and an unanswered DNS lookup would dominate the measurement.
await page.route(`${SUPABASE}/**`, (route) =>
	route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
);

const started = Date.now();
await page.goto(baseURL, { waitUntil: "domcontentloaded" });
const domContentLoadedMs = Date.now() - started;

// A first-time guest is parked on the onboarding pager. "Rendered" = the
// pager is on screen, which is the first thing the user actually sees.
let firstPaintMs = null;
try {
	await page.getByText("Saltar", { exact: true }).first().waitFor({
		state: "visible",
		timeout: 120_000,
	});
	firstPaintMs = Date.now() - started;
} catch {
	/* left null on purpose: a mode that never paints is a failed mode */
}

// From there, the real question for the suite: how long to the consumer tabs?
// The tab labels live in `aria-label` (the pill hides them visually when
// compact), so the tab is only reachable by role — the same selector the
// specs use.
let tabsMs = null;
if (firstPaintMs !== null) {
	const skipAt = Date.now();
	try {
		await page.getByText("Saltar", { exact: true }).first().click();
		await page
			.getByRole("tablist")
			.first()
			.waitFor({ state: "visible", timeout: 60_000 });
		tabsMs = Date.now() - skipAt;
	} catch {
		tabsMs = null;
	}
}

console.log(
	JSON.stringify(
		{
			label,
			domContentLoadedMs,
			firstPaintMs,
			firstPaintUrl: page.url(),
			tabsMsAfterSkip: tabsMs,
			consoleErrors: consoleErrors.slice(0, 5),
		},
		null,
		2,
	),
);

await page.screenshot({ path: `/tmp/opencode/boot-${label}.png` });
await browser.close();
