import {
	expect,
	getServedHtml,
	gotoHydrated,
	ONBOARDING_PATH,
	PRODUCTION_API_HOST,
	STUB_API_ORIGIN,
	test,
} from "./fixtures";

/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * `apps/landing/.env` contains:
 *
 *     VITE_API_URL=https://role-0hjz.onrender.com/api/v1
 *
 * That is a real backend in production, and the landing is an SSR app whose
 * loaders run in the dev server's own Node process. Measured on this repo
 * before any of this suite existed: a plain `curl http://127.0.0.1:3101/` made
 * the dev server open TLS to `216.24.57.18:443` (that host) and took 2.77 s on
 * a cold instance. The `/` loader asks for `/stats/platform`, `/app-config/
 * public` and `/offers/random`; `/about` and `/for-business` ask for
 * `/stats/platform` again.
 *
 * So "run the landing locally" and "call the production API" were the same
 * action, invisibly. That is the kind of coupling no test catches, because
 * every test that touched it passed.
 *
 * This file pins the isolation shut from both sides:
 *
 *  1. The dev server is started with `VITE_API_URL` pointed at a loopback stub
 *     (`playwright.config.ts`) — that is what covers the SERVER-side loader.
 *  2. The `network` fixture aborts and records any browser request to the
 *     production host — that is what covers the CLIENT side, independently, so
 *     a future refactor of the env handling cannot reopen the hole silently.
 *
 * The assertions below are the evidence, not the intent: a green run means the
 * production API was not touched, not that it was configured correctly.
 */
const PUBLIC_ROUTES = [
	"/",
	"/about",
	"/how-it-works",
	"/for-business",
	"/help-center",
	"/terms",
	"/privacy",
] as const;

test.describe("production isolation", () => {
	test("no public route causes a request to the production backend", async ({
		page,
		network,
	}) => {
		for (const path of PUBLIC_ROUTES) {
			await gotoHydrated(page, path);
			// The SSR pass has already resolved by the time goto returns, and
			// the client queries start on hydration. Neither is allowed to touch
			// production, and the fixture would have aborted the attempt anyway —
			// so a failure here means a real request was *attempted*, which is
			// the thing worth failing on.
			await expect(
				page.getByRole("heading", { level: 1 }).first(),
				`${path} must render`,
			).toBeVisible();
		}

		expect(
			network.production,
			`no request may reach ${PRODUCTION_API_HOST}`,
		).toEqual([]);
	});

	test("the browser's API calls are served by the local stub", async ({
		page,
		network,
	}) => {
		// The complement of the assertion above, and the reason the guard is not
		// just "block everything": a suite where the app is starved of data
		// would also pass "no production traffic" while testing a broken page.
		// Proving the data path is intact is what keeps the first test honest.
		await gotoHydrated(page, "/");

		// WHY THIS WAITS ON A REQUEST AND NOT ON THE FOOTER LINK — this wait was
		// wrong before, and it was wrong in a way that only a real bug could hide.
		//
		// It used to assert that the footer's contact address was visible and
		// treat that as "the client query resolved". The premise in the comment
		// ("they only appear once the query resolves") was false: the address was
		// in the SERVED HTML, because `RootComponent` used to hand React a second,
		// empty QueryClient, so SSR always rendered the fallback address and the
		// real one only ever appeared after a client-side fetch.
		//
		// So the test could only pass while the SSR path was broken: with the
		// fallback rendered, the link was invisible until the client fetched, and
		// `apiCalls.length > 0` below was guaranteed. Once the loaders' data
		// actually reaches the server-rendered markup (the fix this suite was
		// written to demand), the address is visible at hydration, this wait
		// returns immediately, and the client fetch has not been issued yet — the
		// assertion below then read 0 and failed.
		//
		// The address is still asserted visible, because it is worth asserting:
		// it is the proof the data path produced real values, not fallbacks. It
		// is simply no longer the thing that waits for the network.
		await expect(
			page.locator('a[href="mailto:hola@e2e.example"]'),
		).toBeVisible();

		// Polling the LOG, not a timer and not `page.waitForRequest`, for two
		// measured reasons:
		//
		//  1. The assertion is about `network.all`, so it has to wait for THAT
		//     array. `page.waitForRequest` resolves from the browser's own network
		//     event, which Playwright delivers BEFORE the context-level
		//     `route` handler runs — measured: the request had matched and the
		//     handler had not yet pushed, so the filter below still read 0.
		//  2. A timer would pass against a build that never fetches, which is the
		//     exact failure this test exists to rule out. `expect.poll` fails with
		//     the real count instead.
		//
		// So: wait on the observable event, which is the only version that can fail.
		const apiCalls = () => network.all.filter((u) => u.includes("/api/v1/"));
		await expect.poll(() => apiCalls().length).toBeGreaterThan(0);

		for (const url of apiCalls()) expect(url).toContain(STUB_API_ORIGIN);
	});

	test("the form's write never leaves the loopback stub", async ({ page }) => {
		// The strongest form of the guarantee, stated as a test: even when a
		// spec lets the real request through instead of stubbing it, the only
		// destination the landing can reach is the stub.
		await gotoHydrated(page, "/business-signup");
		await page.locator("#signup-name").fill("Ada Lovelace");
		await page.locator("#signup-email").fill("ada@e2e.example");
		await page.locator("#signup-password").fill("sup3rsecreta");
		await page.locator("#signup-confirm").fill("sup3rsecreta");
		await page.locator("#signup-business").fill("Panadería La Espiga");

		const submitted = page.waitForRequest(
			(req) => req.url().includes(ONBOARDING_PATH),
		);
		await page.getByRole("button", { name: "Registrar negocio" }).click();
		const request = await submitted;

		expect(request.url()).toContain(STUB_API_ORIGIN);
		expect(request.url()).not.toContain(PRODUCTION_API_HOST);
	});

	test("the production host is not merely un-requested but unreachable", async ({
		page,
		network,
	}) => {
		// Proves the guard itself is live, which is what makes the three tests
		// above meaningful. If this ever fails silently — fixture removed,
		// `route.abort` swapped for `continue` — the rest of the file would
		// still report "zero production requests" because nothing would ever be
		// recorded, and the isolation would be gone with a green suite.
		await gotoHydrated(page, "/");

		// An explicit attempt against the production origin, which only the
		// fixture's abort can stop.
		const blocked = await page.evaluate(async (host) => {
			try {
				await fetch(`https://${host}/api/v1/stats/platform`, {
					mode: "cors",
				});
				return "reached";
			} catch {
				return "blocked";
			}
		}, PRODUCTION_API_HOST);

		expect(blocked).toBe("blocked");
		expect(network.production.length).toBeGreaterThan(0);
	});

	test("every served route answers 200 from the dev server", async ({ request }) => {
		// A cheap regression net for the webServer wiring itself: if the env
		// override or the port ever breaks, this fails with "connection refused"
		// instead of the whole file reporting a confusing zero-request result.
		for (const path of PUBLIC_ROUTES) {
			const { status } = await getServedHtml(request, path);
			expect(status, `${path} must be served`).toBe(200);
		}
	});
});
