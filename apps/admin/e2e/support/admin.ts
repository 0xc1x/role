import { expect, type Page } from "@playwright/test";

import {
	ADMIN_EMAIL,
	ADMIN_PASSWORD,
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
 * makes. `page.route` only sees browser traffic, so overriding `/payouts` or
 * `/categories/admin` here has no effect on the route `loader` that fetches them
 * during SSR. The error-state specs use `/businesses` and `/orders/admin`
 * precisely because those have no loader and are fetched by the browser.
 */
export async function stubApi(page: Page, overrides: ApiOverride = {}) {
	await page.route("**/api/v1/**", async (route) => {
		const url = new URL(route.request().url());
		const path = url.pathname.replace(/^\/api\/v1/, "");

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
