import { expect, test } from "@playwright/test";

import {
	stubApi,
	waitForGuardDecision,
	waitForLoginForm,
} from "./support/admin";

/**
 * The authentication gate of the whole panel.
 *
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * `_layout.tsx` guards every section behind `getToken()`, and `routes/index.tsx`
 * turns `/` into a bounce. Both run in `beforeLoad`, which means they are the
 * only thing standing between an anonymous browser and the admin UI, and nothing
 * in the repo tested them end to end. `bun test src` mounts components with the
 * token already present or already absent, so the redirect itself — the part a
 * user actually experiences — was never the thing under test.
 *
 * ─── What the gate really does, measured rather than assumed ────────────────
 *
 * The brief expected a single story: "no session, `/` redirects to login". The
 * measurements say the gate has two halves that behave differently, and writing
 * one test for both would have hidden a defect that the second half turns out to
 * contain. All four facts below were read off a running server, not off source.
 *
 *   1. `/` really does answer 307 to `/login` at the HTTP layer. `index.tsx`
 *      calls `getToken()` with no `typeof window` guard, so during SSR
 *      localStorage is always empty and the server ALWAYS bounces `/` — even for
 *      a user who is about to log in successfully. That is why a valid login
 *      lands on `/home` and not back on `/`.
 *
 *   2. `page.goto("/")` reports 200, not 307, because Playwright follows
 *      redirects. The status has to be read with `maxRedirects: 0` or the test
 *      is asserting about the wrong response object entirely.
 *
 *   3. A section route does NOT redirect on auth. `_layout.tsx` returns early
 *      when `typeof window === "undefined"`, so `GET /negocios` answers 307 only
 *      to normalise search params (`?page=1&limit=10`) and then 200 with the
 *      layout shell.
 *
 *   4. And then the client does not finish the job either — see the marked
 *      defect at the bottom of this file.
 */

/**
 * The headline fact of the whole suite, measured at the layer that actually
 * produces it.
 *
 * `maxRedirects: 0` is the whole point of this test. `page.goto` follows the
 * redirect and hands back the FINAL response, so the obvious version of this
 * assertion (`await page.goto("/")` then read `.status()`) sees 200 and either
 * fails or, worse, gets "fixed" by someone who decides the gate should be a
 * client-side one.
 */
test("an anonymous request to / is refused with a 307 to /login", async ({
	request,
}) => {
	const response = await request.get("/", { maxRedirects: 0 });

	expect(response.status()).toBe(307);
	expect(response.headers().location).toBe("/login");
});

/**
 * ...and the redirect target is a working login form, not a 404 or a blank
 * shell. Half of a redirect being correct is not a redirect being correct.
 */
test("the redirect lands on a login form that accepts input", async ({
	page,
}) => {
	await page.goto("/");

	await expect(page).toHaveURL(/\/login$/);
	await expect(
		page.getByRole("button", { name: "Iniciar Sesión" }),
	).toBeVisible();
	await expect(page.locator('input[name="email"]')).toBeVisible();
	await expect(page.locator('input[name="password"]')).toBeVisible();
});

/**
 * A 307 with a correct `location` is only half the contract, so this one closes
 * the loop through the browser: the status AND the destination, in one test, so
 * neither can be satisfied while the other is broken.
 */
test("the 307 and the browser destination agree", async ({ page, request }) => {
	const http = await request.get("/", { maxRedirects: 0 });
	expect(http.status()).toBe(307);

	await page.goto("/");
	await expect(page).toHaveURL(/\/login$/);
	await waitForLoginForm(page);
});

/**
 * The durable security property, and the one that must hold no matter how the
 * routing is refactored: an anonymous browser must never see the panel's data.
 *
 * Written as "the fixture's row is not on the page" rather than "the API was not
 * called", because the request may legitimately already be in flight when a
 * redirect lands — asserting on the absence of a request would be a race, and a
 * flaky one. What must never happen is the render.
 */
test("a protected section never renders its content for an anonymous browser", async ({
	page,
}) => {
	await stubApi(page);
	await page.goto("/negocios");
	// Deliberately NOT `waitForLoginForm`: on a protected route there is no login
	// form to hydrate, so waiting for one burns the full 20 s timeout before
	// concluding what the defect tests below already establish.
	await page.waitForLoadState("networkidle");

	await expect(page.getByText("Panadería E2E")).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Negocios" })).toHaveCount(0);
});

/**
 * ─── FIXED, and the assertions below are the pin ──────────────────────────
 *
 * This test was written as `test.fail()` over the broken behaviour: a
 * permanently blank page. `test.fail()` asserts the CURRENT state, so the day
 * the gate was fixed this test went red and demanded the marker come out. That
 * is the whole point of the marker, and the marker is now gone.
 *
 * The fix was not "make `beforeLoad` run during SSR" — it could not be, and
 * trying would have logged every operator out. During SSR `localStorage` does
 * not exist, so a server-side "protected route" guard can only ever see "no
 * token" and would bounce authenticated users too. The missing piece was the
 * CLIENT half running at hydration, which is what `useRequireSession()` in
 * `features/auth/utils/guards.ts` now does, and what `RouteComponent` rendering
 * a skeleton instead of `null` makes visible instead of a blank void.
 *
 * The security property above this test still holds: the fixture row and the
 * section heading are asserted absent, so "we now redirect the anonymous user"
 * can never be satisfied by "we now leak the panel to everyone".
 *
 * ─── And then the test itself went flaky, which is a second bug ─────────────
 *
 * With the gate fixed, this test was green 6 of 6 in isolation and red 5 of 6
 * under three-way contention — with the changes stashed, so it is PRE-EXISTING
 * and not something the section work introduced. The cause is a race, not a
 * regression: the redirect is driven by a `useEffect`, so under a loaded box
 * "the URL says /login" and "the guard has decided" are two different moments,
 * and the default 5 s `toHaveURL` budget expires between them.
 *
 * The temptation was to make the suite slower instead — capping workers so the
 * race stops appearing. That trades a real 2.2 m → 3.0 m for a symptom nobody
 * can explain when it comes back, so the fix belongs in the WAIT, not in the
 * scheduler: `waitForGuardDecision` gates on React having committed the login
 * form, which is downstream of the guard's decision and cannot be reached by
 * server-rendered markup. See its comment in `support/admin.ts` for the
 * measurements, including why the landing's own `/api/v1/` gate has no analogue
 * on this route and would simply hang here.
 */
test("an anonymous deep-link reaches the login form", async ({ page }) => {
	await stubApi(page);
	await page.goto("/negocios");

	// The TERMINAL condition, and the order is the whole point: the guard has to
	// have run and decided before either assertion below means anything. Both are
	// then instant facts about a settled page instead of polls on a URL that is
	// still mid-redirect.
	//
	// `toHaveURL` first, deliberately: it is still the claim being made — an
	// anonymous deep-link lands on the LOGIN route, not merely on any page with a
	// password field. It no longer carries the race, because the guard is already
	// known to have committed its navigation when it runs.
	await waitForGuardDecision(page);

	await expect(page).toHaveURL(/\/login$/);
	await expect(
		page.getByRole("button", { name: "Iniciar Sesión" }),
	).toBeVisible();
});
