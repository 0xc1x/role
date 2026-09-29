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
			command: `VITE_API_URL=http://127.0.0.1:${STUB_API_PORT}/api/v1 bunx vite dev --port ${PORT} --host 127.0.0.1`,
			port: PORT,
			// The dev server must boot fresh. A reused one would have been
			// started with whatever `VITE_API_URL` the shell had, which is the
			// production URL by default — reusing it would silently reintroduce
			// the exact traffic this suite exists to rule out.
			reuseExistingServer: false,
			stdout: "pipe",
			stderr: "pipe",
			timeout: 180_000,
		},
	],
});
