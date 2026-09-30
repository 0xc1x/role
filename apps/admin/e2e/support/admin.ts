import { expect, type Page } from "@playwright/test";

import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
	failureSentinelFor,
	respondTo,
} from "../fixtures/api-fixtures";

export { ADMIN_EMAIL, ADMIN_PASSWORD };

/**
 * The browser-side half of the network stub, plus the two helpers every spec
 * needs. The payload table itself lives in `../fixtures/api-fixtures` because
 * the Vite server fetches part of this API too and both halves must agree; see
 * the header of that file and of `stub-api.ts` for the measurement that forced
 * the split.
 */

export type ApiOverride = Record<string, { status: number; body: unknown }>;

/**
 * Install one route handler for the whole `/api/v1/**` surface.
 *
 * `route.continue()` at the bottom is the anti-vacuity guard: an unstubbed path
 * reaches the fixture server, which answers 404, which the panel renders as an
 * error. A spec that navigates somewhere new therefore fails visibly instead of
 * passing against a plausible-looking default.
 *
 * KNOWN LIMIT, and it is a real one: this cannot fail a request the Vite server
 * makes. `page.route` only sees browser traffic. `/payouts` and
 * `/categories/admin` were the last two routes whose data arrived that way —
 * they declared a route `loader`, and loaders run during SSR in the Vite Node
 * process — so an override of either path here used to be an override nobody
 * consulted, which is a spec that silently proves nothing. Both loaders are now
 * removed (same reason, and same measured cost, as the other ten list routes: a
 * loader failure escapes to the route's `errorComponent`, and no route in the
 * panel defines one, so the whole panel was replaced by TanStack Router's
 * default "Something went wrong!" — no sidebar, no section, no "Reintentar").
 * With them gone every `/api/v1/**` call the panel makes is a browser call, so
 * this handler is no longer a partial stub: it is the whole one, and the error
 * state of every section is reachable from a test.
 */
export async function stubApi(page: Page, overrides: ApiOverride = {}) {
	await page.route("**/api/v1/**", async (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname.replace(/^\/api\/v1/, "");

		// The deliberate outage, checked BEFORE the success table on purpose: a
		// sentinel filter has to mean 500 even though `respondTo` would happily
		// return a fixture for that path. The stub SERVER honours the same
		// predicate, because the same request can be issued by either side and the
		// outage must not depend on which one won the race.
		if (failureSentinelFor(path, url.searchParams)) {
			await route.fulfill({
				status: 500,
				contentType: "application/json",
				body: JSON.stringify({ message: "Deliberate outage sentinel" }),
			});
			return;
		}

		const override = overrides[path];
		if (override) {
			await route.fulfill({
				status: override.status,
				contentType: "application/json",
				body: JSON.stringify(override.body),
			});
			return;
		}

		const body = respondTo(path, url.searchParams);
		if (body === undefined) {
			await route.continue();
			return;
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(body),
		});
	});
}

/**
 * Wait until React has actually claimed the login form.
 *
 * ─── The hydration trap, which cost this suite its first three drafts ───────
 *
 * Clicking "Iniciar Sesión" before React hydrates does not fail loudly. The
 * server-rendered `<form>` has no `action`, so the browser performs its native
 * GET submit and navigates to `/login?email=…&password=…` — leaking the
 * password into the URL and the history — and the spec is left holding a login
 * page that still has a password field in it.
 *
 * Two plausible gates were measured and BOTH are wrong:
 *
 * 1. `expect(submit).toBeEnabled()`. The intuition is that `canSubmit` gates the
 *    button on the schema, so disabled would mean "not ready". It is not:
 *    `curl` of the SSR HTML shows `<button type="submit" …>` with no `disabled`
 *    attribute at all, so the assertion passes instantly on a page that has not
 *    hydrated a byte. Every login test in the first draft was green for the
 *    wrong reason. `canSubmit` is TanStack Form's submission flag, not a derived
 *    validity flag, and the block on an invalid form comes from the `onSubmit`
 *    validator instead.
 * 2. `window.$_TSR.hydrated`, TanStack Start's own flag. It stayed false for
 *    the whole run in this version, so waiting on it times out.
 *
 * What works is asking whether React has taken ownership of the exact node we
 * are about to type into: hydration attaches a `__reactProps$*` expando to every
 * node it hydrates, and a node without one has no event handler attached no
 * matter what its attributes say. It is a per-node fact, it is what actually
 * prevents the native submit, and it does not reach into TanStack's internals.
 * Measured: with this gate the click goes through React; without it, it does not.
 *
 * No `waitForTimeout` anywhere in this file, deliberately. A sleep is a guess
 * about how long hydration takes, and it is wrong on a cold CI runner exactly
 * when the suite is about to be trusted.
 */
export async function waitForLoginForm(page: Page) {
	await page.waitForFunction(
		() => {
			const el = document.querySelector<HTMLInputElement>(
				'input[name="email"]',
			);
			return (
				el !== null &&
				Object.keys(el).some((key) => key.startsWith("__reactProps$"))
			);
		},
		null,
		{ timeout: 20_000 },
	);
}

/**
 * Wait until the auth guard has RUN and DECIDED, not until a URL looks right.
 *
 * ─── Why the URL is not a terminal condition here ───────────────────────────
 *
 * `useRequireSession()` lives in a `useEffect` (`features/auth/utils/guards.ts`),
 * so the decision this test cares about happens strictly AFTER hydration — and
 * only the client half of it can happen at all, because `localStorage` does not
 * exist during SSR. `expect(page).toHaveURL(/\/login$/)` polls a URL that is
 * still mid-flight: on a loaded box the redirect commits and the assertion is
 * already true when it first looks. Under contention it is not.
 *
 * MEASURED, admin, 24 competing CPU hogs + 8 Playwright workers, 6 repeats of
 * the old test: 6 of 6 failed, every one of them the same way —
 *
 *   Expected pattern: /\/login$/
 *   Received string:  "http://127.0.0.1:3110/negocios?page=1&limit=10"
 *   Timeout: 5000ms
 *
 * i.e. not a mismatch, a budget: the URL had not moved yet. Timestamped probe
 * on the same box puts the whole chain at ~29 s (goto resolved +5.2 s, guard
 * redirect +29.3 s), and the old assertion's 5 s default is spent long before
 * the guard has decided anything. Raising that number would be treating the
 * symptom; the same measurement also shows the app is CORRECT — the redirect
 * does happen, just later than a mid-flight URL can be trusted to show.
 *
 * ─── Why the landing's own signal does not transfer, and what replaces it ────
 *
 * `apps/landing/e2e/fixtures.ts` gates hydration on the app's client query to
 * `/api/v1/`, armed before the `goto`. That criterion is right and it was
 * measured there — but it has no analogue on THIS route. Probe output on the
 * anonymous deep-link logged ZERO `/api/v1/` requests, and the reason is in the
 * app: `useAuthUser()` is `enabled: !!getToken()`, and without a token the
 * query is disabled, so nothing fetches. `RouteComponent` renders
 * `SessionPending` instead of `<Outlet/>`, so the section's own list query never
 * mounts either. An admin deep-link is the one page in the panel where the
 * client is provably silent, so a waiter on a client request would hang here
 * and its symptom would look like a slow suite rather than a broken one.
 *
 * What replaces it is the same KIND of fact — a per-node proof that React has
 * committed the tree — pointed at the node the guard's decision is ABOUT:
 * `input[name="email"]` carries a `__reactProps$` expando. Three independent
 * measurements make it terminal rather than decorative:
 *
 *   1. SSR of `/negocios` for an anonymous browser contains no login form at
 *      all (`curl | grep -c "Iniciar Sesión"` → 0). The node can therefore only
 *      come from the client render the guard's navigation triggered; there is no
 *      server-rendered version of it to match early.
 *   2. It is downstream of the decision: the guard navigates, `/login` renders,
 *      React hydrates THAT tree. The expando cannot appear before the redirect.
 *   3. It is the same expando `waitForLoginForm` already gates on, so the
 *      suite keeps ONE hydration oracle instead of two that can disagree.
 *
 * It also happens to be the strongest available statement of the property under
 * test — "the anonymous browser ended up on a login form React actually owns",
 * which is a superset of "the URL string says /login". A redirect that landed on
 * a dead shell would satisfy `toHaveURL` and fail here.
 */
export async function waitForGuardDecision(page: Page) {
	await page.waitForFunction(
		() => {
			const el = document.querySelector<HTMLInputElement>(
				'input[name="email"]',
			);
			return (
				el !== null &&
				Object.keys(el).some((key) => key.startsWith("__reactProps$"))
			);
		},
		null,
		// No explicit `timeout`: this inherits the test budget instead of
		// inventing a second, larger one. The point of the gate is to change WHAT
		// is waited on, not to buy more time.
	);
}

/**
 * Fill the login form and submit it, waiting on observables only.
 *
 * Waits for the sidebar email rather than for the URL. `LoginForm` navigates to
 * `/home` on any successful mutation, so the URL alone would also be satisfied
 * by a session the panel then discarded; the email can only be on screen once
 * `/auth/me` resolved and the sidebar rendered the account the API returned.
 */
export async function signIn(page: Page) {
	await page.goto("/login");
	await waitForLoginForm(page);

	await page.locator('input[name="email"]').fill(ADMIN_EMAIL);
	await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
	await page.getByRole("button", { name: "Iniciar Sesión" }).click();

	await expect(page).toHaveURL(/\/home$/);
	await expect(page.getByText(ADMIN_EMAIL)).toBeVisible();
}
