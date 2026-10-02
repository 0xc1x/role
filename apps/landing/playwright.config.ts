import base from "../../playwright.config";
import { defineConfig, devices } from "@playwright/test";

/**
 * Landing e2e config: the shared monorepo baseline plus what only this app owns.
 *
 * ─── The one thing this file is careful about ───────────────────────────────
 *
 * `VITE_API_URL` is overridden for the dev server this suite starts. That is
 * not a convenience. `apps/landing/.env` points at a real production backend
 * (`https://role-0hjz.onrender.com/api/v1`), and the `/` route's loader awaits
 * `GET /stats/platform` on every server render — measured: a plain
 * `curl http://127.0.0.1:3101/` made the dev server open TLS to
 * `216.24.57.18:443` and took 2.77 s on a cold instance. Without the override,
 * every page load of this suite would read production, and any future spec that
 * posts a form would write to it. Process env wins over `.env` in Vite, which
 * makes this override the single switch that makes the suite hermetic.
 *
 * Port 3101, not 3001: `bun run dev` uses 3001, and a suite that fights the
 * developer's own server is a suite people stop running.
 *
 * Everything this suite depends on is set explicitly below rather than
 * inherited, so a change to the shared baseline cannot silently change what
 * this suite runs against.
 */
const PORT = 3101;
const STUB_API_PORT = 3999;

export default defineConfig({
	...base,
	testDir: "./e2e",
	// One worker: every spec shares the single stub server and the single dev
	// server below, and a second worker would race them for the port. It also
	// keeps the "zero production traffic" counts meaningful instead of
	// interleaved with another spec's traffic.
	workers: 1,
	fullyParallel: false,
	projects: [
		{ name: "chromium", use: { ...devices["Desktop Chrome"] } },
	],
	use: {
		...base.use,
		...devices["Desktop Chrome"],
		baseURL: `http://127.0.0.1:${PORT}`,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	webServer: [
		{
			command: "bun e2e/stub-api.ts",
			port: STUB_API_PORT,
			reuseExistingServer: !process.env.CI,
			stdout: "pipe",
			stderr: "pipe",
		},
		{
			// ── WHY THE BUILD AND NOT `vite dev` ──────────────────────────────
			//
			// This was the last app still serving a dev server in its e2e: admin
			// already used `build && vite preview`, and mobile
			// `export:web` + a static server. Both moved for the same reason, and
			// the reason is measured in `apps/admin/playwright.config.ts:80-84`
			// over this same chain (`signIn` → `goto section` → `expect row`),
			// one browser at a time vs several:
			//
			//   | workers | vite dev | vite preview (prod build) |
			//   |---------|----------|--------------------------|
			//   |    1    |   7.7 s  |   3.9 s                  |
			//   |    4    |  10.9 s  |   7.7 s                  |
			//   |    8    |  19.8 s  |  14.4 s                  |
			//
			// The dev server serialises every SSR render through ONE Node
			// process, so a test's cost grows with the number of workers hitting
			// it: 7.7 s → 19.8 s. The build takes that transform work off the
			// request path entirely, and its number does not depend on a cache
			// CI does not keep.
			//
			// Landing is the most SSR-heavy of the three — SEVEN public routes,
			// and `production-isolation.spec.ts` walks all of them inside one
			// test — so it was the app paying the most for a dev server. And the
			// first sign that something was off was exactly there: that test
			// timed out on budget, with 25.9 s of real work against a 30 s limit.
			//
			// It is also the artefact that actually ships. `vite dev` serves a
			// DEV bundle, so testing it means testing a different program from
			// the one users get — the same argument that moved mobile off
			// `expo start --web`.
			//
			// MEASURED on this branch, over all 40 tests of the suite: 267 s with
			// `vite dev` → 128 s with the build, i.e. 2.09x. And it is not only
			// time: under the dev server 2 of those 40 failed on budget, and
			// with the build all 40 pass.
			command: `VITE_API_URL=http://127.0.0.1:${STUB_API_PORT}/api/v1 bun run build && VITE_API_URL=http://127.0.0.1:${STUB_API_PORT}/api/v1 bunx vite preview --port ${PORT} --host 127.0.0.1`,
			port: PORT,
			// The preview must boot fresh. A reused one — from another branch,
			// or booted with the shell's `VITE_API_URL`, which defaults to the
			// production URL — would silently reintroduce the exact traffic this
			// suite exists to rule out.
			reuseExistingServer: false,
			stdout: "pipe",
			stderr: "pipe",
			// The budget is NOT for a server hang: it is for the BUILD that
			// precedes it, which lives inside the same command. Measured 75-84 s
			// on this box, and admin's is 99 s — the "~6 s" in admin's own
			// comment has gone stale. With `turbo` running all four e2e suites
			// at once, this build competes with admin's and with mobile's
			// `export:web` on a 2-core runner, so 180 s was thin for a cold
			// start. 300 s is room for that, not slack.
			timeout: 300_000,
		},
	],
});
