import { defineConfig } from "@playwright/test";
import base from "../../playwright.config";

/**
 * Ports are ours and ours alone.
 *
 * 3000 is the developer's own `vite dev`, and it is very likely running right
 * now — reusing it would mean the suite silently tests whatever the human had
 * half-saved, and a 200 from a stale server looks exactly like a 200 from ours.
 * 3101/3999 belong to the landing agent and 8085 to mobile, so the whole
 * three-agent fan-out shares the machine. Each agent gets its own pair.
 */
const PORT = Number(process.env.ADMIN_E2E_PORT ?? 3110);
const STUB_API_PORT = Number(process.env.ADMIN_E2E_STUB_PORT ?? 4110);

const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Must match the path `e2e/stub-api.ts` strips before matching handlers. */
const STUB_API_URL = `http://127.0.0.1:${STUB_API_PORT}/api/v1`;

export default defineConfig({
	...base,
	testDir: "./e2e",
	// `e2e/**` holds support code, not specs. Playwright's default
	// `**/*.@(spec|test).ts` already ignores it, but being explicit means a
	// support file can never be collected by accident if it is ever renamed.
	testMatch: "**/*.spec.ts",
	// `workers` is inherited from `base` and there is deliberately no local cap.
	//
	// There WAS one — 2 workers — added as a mitigation: at Playwright's default
	// (half the cores, 8 on this 16-core box) the three-app `bun run test:e2e`
	// asks for 8 + 8 + 8 = 24 Chromium instances, and 6 admin tests failed at
	// ~30.2 s each. Two were pre-existing. Capping workers took that to 0-1 and
	// cost 2.2 m → 3.0 m, and it was never a fix: it made the race stop appearing
	// by removing the load that exposed it, which is a worse trade than it looks
	// because the next person to add a timing-sensitive wait has no signal that
	// anything is wrong.
	//
	// The race was fixed where it belonged instead, in
	// `waitForGuardDecision` (`e2e/support/admin.ts`): the deep-link test now
	// waits for a terminal signal — React having committed the login form, which
	// is downstream of the guard's decision — instead of a URL that is still
	// mid-redirect. MEASURED after that fix, `PLAYWRIGHT_WORKERS=8`, three runs
	// in a row: 73 passed, 0 failed, 1.7 m each. Identical to the capped timing,
	// because the cap was buying nothing but a slower suite.
	//
	// `PLAYWRIGHT_WORKERS` still overrides, and CI still gets `base`'s single
	// worker. If this suite goes red under three-way contention again, the fix
	// belongs in the test that is racing — not in this line.
	use: {
		...base.use,
		baseURL: BASE_URL,
	},
	webServer: [
		{
			// The server-function half of the network stub. Started first: the
			// admin dev server resolves VITE_API_URL at boot, and pointing it at
			// a port nothing is listening on yet would just move the failure.
			command: `bun e2e/stub-api.ts`,
			port: STUB_API_PORT,
			stdout: "pipe",
			stderr: "pipe",
		},
		{
			// `VITE_API_URL` is the override that makes the whole scheme work.
			// It has to be an env var on THIS process, not a `.env` edit: the
			// checked-in `.env` points at `localhost:4001`, the real API, and an
			// e2e that talks to that is testing the backend a second time with
			// nobody watching. Overriding the environment leaves the developer's
			// `.env` alone and cannot be committed by accident.
			//
			// WHY THE BUILD INSTEAD OF `vite dev` — the same lesson as
			// `apps/mobile`, measured rather than assumed.
			//
			// The dev server serialises every SSR render through ONE Node process,
			// so a test's cost grows with the number of workers hammering it. Same
			// three-phase chain (`signIn` → `goto section` → `expect row`), one
			// browser at a time vs eight, this box, Chromium:
			//
			//   | workers | vite dev | vite preview (prod build) |
			//   |---------|----------|--------------------------|
			//   |    1    |   7.7 s  |   3.9 s                  |
			//   |    4    |  10.9 s  |   7.7 s                  |
			//   |    8    |  19.8 s  |  14.4 s                  |
			//
			// (median per-test total). The dev numbers blow the 30 s test budget
			// once three browser suites share a runner: the 8-worker median is
			// already two thirds of it before landing and mobile take any of it.
			// The build removes the transform work from the request path entirely,
			// which is also why its number does not depend on a cache CI does not
			// keep.
			//
			// It is additionally the artefact that actually ships. `vite dev`
			// serves a DEV bundle; testing it means testing a different program
			// from the one users get, exactly the argument that moved mobile off
			// `expo start --web`.
			//
			// `reuseExistingServer` stays off: a preview left over from another
			// branch would be a suite passing against code that is not under test.
			command: `VITE_API_URL=${STUB_API_URL} bun run build && VITE_API_URL=${STUB_API_URL} bunx vite preview --port ${PORT} --host 127.0.0.1`,
			url: BASE_URL,
			// A preview left over from another branch, or one booted against the
			// developer's own `VITE_API_URL`, must never be reused: from the
			// outside both look exactly like ours. Playwright's own default is
			// `!process.env.CI`, which WOULD reuse one on a developer machine.
			reuseExistingServer: false,
			// The build is ~6 s warm on this box; the budget is for a cold CI
			// runner where the first rolldown pass is slower, not for a hang.
			timeout: 180_000,
			stdout: "pipe",
			stderr: "pipe",
		},
	],
});
