import { defineConfig, devices } from "@playwright/test";

/**
 * Shared Playwright baseline for the whole monorepo.
 *
 * Why one root config instead of three independent ones: the three apps ship
 * with the same runner on purpose. A repo where each app picked its own
 * e2e framework is a repo where `bun run test:e2e` means three different
 * things depending on which workspace you are standing in.
 *
 * What this file deliberately does NOT contain:
 *
 * - `projects`. Each app owns its own browser/device profile and its own
 *   `webServer`, and a shared project list would force the three apps to
 *   agree on hardware they do not have in common (a PWA on a phone
 *   viewport, an admin panel on a desktop one).
 * - `webServer` and `baseURL`. Those are per-app: each app serves its own
 *   artifact on its own port.
 *
 * So an app config spreads this and overrides what it owns:
 *
 * ```ts
 * import base from "../../playwright.config";
 * export default defineConfig({
 *   ...base,
 *   testDir: "./e2e",
 *   use: { ...base.use, baseURL: "http://127.0.0.1:8085" },
 *   webServer: { ... },
 * });
 * ```
 */
export default defineConfig({
	// A spec is a spec even when it is slow. Every app config overrides
	// testDir; this default only matters when the root config is run bare.
	testDir: "./e2e",
	// Each spec owns its own browser context and its own network stub, so
	// there is no shared state to serialize over.
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	// A browser suite is the flakiest thing in this repo by nature. Two
	// retries absorb a CDN hiccup or a cold font cache; they must never
	// hide a real failure, which is why `retries` stays at 0 locally.
	retries: process.env.CI ? 2 : 0,
	// CI runners are 2-core. More workers than cores makes the 25-minute
	// `quality` budget the bottleneck instead of the tests.
	workers: process.env.CI ? 1 : undefined,
	// `list` in CI because a CI log is the only place a failure is read.
	// The HTML report is written on failure and uploaded as an artifact.
	reporter: process.env.CI
		? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
		: [["list"]],
	use: {
		...devices["Desktop Chrome"],
		// A failure with no trace is a failure nobody can debug. `on-first-retry`
		// keeps the default local runs free of the overhead.
		trace: "on-first-retry",
		screenshot: "only-on-failure",
		video: "off",
		actionTimeout: 15_000,
		// Navigation for a 7.6 MB web bundle on a cold CI runner.
		navigationTimeout: 60_000,
	},
});
