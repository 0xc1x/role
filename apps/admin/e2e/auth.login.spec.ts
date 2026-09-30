import { expect, test } from "@playwright/test";

import {
	ADMIN_PASSWORD,
	signIn,
	stubApi,
	waitForLoginForm,
} from "./support/admin";

/**
 * The login flow, in both directions.
 *
 * ─── Why this file exists, given `apps/api/test/auth.e2e-spec.ts` exists ────
 *
 * That suite proves the API validates a password. This one proves the PANEL
 * reacts correctly, and the two have almost nothing in common: the panel's
 * login is a `createServerFn`, so the payload crosses a serialization boundary,
 * the response is re-validated by `AuthResponseSchema` on the other side, the
 * refresh token is written to an httpOnly cookie the test cannot read, and the
 * access token is written to localStorage. Every one of those steps can fail
 * while the API is perfectly healthy, and none of them is exercised by an API
 * test because none of them exists in the API.
 *
 * The stub is `e2e/stub-api.ts`; the reasoning for why this boundary needs a
 * real server and not `page.route()` is documented there, and it was measured.
 */

test.describe("the login form", () => {
	/**
	 * The happy path, and the assertion that actually proves the user is inside:
	 * the panel rendered the account the API returned.
	 *
	 * "The URL is /home" would be a much weaker claim — `LoginForm` navigates to
	 * `/home` on any successful mutation, including one where the session was
	 * then thrown away. Seeing `admin@role.test` in the sidebar means the whole
	 * chain held: the server function ran, `AuthResponseSchema` accepted the
	 * body, the access token reached localStorage, and `GET /auth/me` came back
	 * with the same user the login returned.
	 */
	test("valid credentials put the operator inside the panel", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);

		// The email is the proof: it can only be on screen if `/auth/me` resolved
		// and the sidebar rendered the account the API returned. A URL assertion
		// would pass on a session that the panel then threw away.
		await expect(page.getByText("admin@role.test")).toBeVisible();
		// `Dinero` is a real `<h2>`, unlike `CardTitle`, which renders a `div` and
		// so is not addressable by role. Asserting `getByRole("heading")` for a
		// card title is a false premise that reads like a passing test's intent.
		await expect(
			page.getByRole("heading", { name: "Dinero", exact: true }),
		).toBeVisible();
		// The pending-businesses card is present even with an empty fixture list,
		// which is the point: the dashboard loaded, it did not render an error.
		await expect(page.getByText("Negocios recientes pendientes")).toBeVisible();
	});

	/**
	 * The access token has to survive in localStorage, because every subsequent
	 * request is built from it by `lib/api/client.ts` and there is no server-side
	 * session to fall back on. If this key ever stops being written, the panel
	 * still looks logged in for exactly one render and then bounces — a failure
	 * that no URL assertion would catch.
	 */
	test("a valid login persists the access token for the next request", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);

		const token = await page.evaluate(() =>
			localStorage.getItem("role_admin_auth_token"),
		);
		expect(token).toBe("stub-access-token");
	});

	/**
	 * `expires_at` is stored as a STRING and read back through
	 * `new Date(expiresAt).getTime()`.
	 *
	 * The reason this is a test and not a comment: `TimestamptzSchema` in
	 * `commons` is `z.string().min(1)`, so an epoch-in-seconds *string* — the
	 * exact value Supabase hands the API before `auth.service.ts:128` converts it
	 * with `new Date(... * 1000).toISOString()` — passes validation and then
	 * produces `NaN` in the client. `Date.now() >= NaN` is `false`, so
	 * `isTokenExpired()` reports a stale token as fresh, forever, silently.
	 *
	 * The stub emits a real ISO string, and this test is the pin. The mutation
	 * run swapped it for `"1789234567"` and watched the suite go red.
	 */
	test("the stored expiry is ISO 8601, not a raw epoch", async ({ page }) => {
		await stubApi(page);
		await signIn(page);

		const expiresAt = await page.evaluate(() =>
			localStorage.getItem("role_admin_token_expires_at"),
		);

		expect(expiresAt).not.toBeNull();
		// A parseable date is the actual requirement; a bare epoch string is not.
		expect(
			Number.isNaN(new Date(expiresAt ?? "").getTime()),
			`the stored expiry ${expiresAt} is not a parseable date`,
		).toBe(false);
		// And it is in the future, which is the property a silent NaN destroys.
		expect(new Date(expiresAt ?? "").getTime()).toBeGreaterThan(Date.now());
	});

	/**
	 * The negative case, and the one most login suites omit.
	 *
	 * Two separate things must be true and both are asserted: the operator is
	 * told what happened, and the operator is NOT inside. A login form that shows
	 * an error and drops the user in anyway would pass an
	 * `expect(errorMessage).toBeVisible()` on its own.
	 */
	test("wrong credentials show the API's message and do not let the user in", async ({
		page,
	}) => {
		await stubApi(page);

		await page.goto("/login");
		await waitForLoginForm(page);
		await page.locator('input[name="email"]').fill("admin@role.test");
		// Right address, wrong secret: the stub refuses anything that is not the
		// one account it knows, exactly as the real API does.
		await page.locator('input[name="password"]').fill("not-the-password");

		const submit = page.getByRole("button", { name: "Iniciar Sesión" });
		await expect(submit).toBeEnabled();
		await submit.click();

		// The message is the API's, not the form's. `loginFn` rethrows
		// `errJson.message` and `LoginForm` renders `mutation.error.message`, so
		// seeing this exact string proves the error survived the server-function
		// boundary instead of being flattened into a generic one.
		await expect(page.getByText("Invalid email or password")).toBeVisible();

		await expect(page).toHaveURL(/\/login$/);
		await expect(page.locator('input[name="email"]')).toBeVisible();
		const token = await page.evaluate(() =>
			localStorage.getItem("role_admin_auth_token"),
		);
		expect(token, "a refused login still wrote a token").toBeNull();
	});

	/**
	 * The error must not leave the form unusable. A login screen that shows the
	 * failure and then cannot be retried is a dead end, and the retry is the one
	 * path where the operator is actually stuck.
	 */
	test("a refused login can be retried without reloading the page", async ({
		page,
	}) => {
		await stubApi(page);

		await page.goto("/login");
		await waitForLoginForm(page);
		await page.locator('input[name="email"]').fill("admin@role.test");
		await page.locator('input[name="password"]').fill("not-the-password");
		const submit = page.getByRole("button", { name: "Iniciar Sesión" });
		await expect(submit).toBeEnabled();
		await submit.click();
		await expect(page.getByText("Invalid email or password")).toBeVisible();

		// Second attempt, same page, correct secret.
		await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
		await expect(submit).toBeEnabled();
		await submit.click();

		await expect(page).toHaveURL(/\/home$/);
		await expect(page.getByText("Invalid email or password")).toHaveCount(0);
	});

	/**
	 * Malformed credentials must be rejected in the BROWSER, before the request
	 * exists. The property worth protecting is not the error message — it is
	 * that a typo'd address never leaves the machine, never hits the API, and
	 * never lands in a server log.
	 *
	 * Asserted by watching the one request the browser would make: `loginFn` is
	 * a server function, so a submitted login shows up as a POST to the
	 * `_serverFn` path. Counting those is a direct observation, not a proxy for
	 * "nothing happened".
	 *
	 * NOTE on a wrong intuition this test replaces: the submit button is NOT
	 * disabled while the form is invalid. `curl` of the SSR HTML shows
	 * `<button type="submit" …>` with no `disabled` attribute, and the button
	 * stays enabled, because `canSubmit` is TanStack Form's submission flag
	 * rather than a derived validity flag. The block comes from the `onSubmit`
	 * validator refusing to run the mutation at all.
	 */
	test("an invalid email never reaches the API", async ({ page }) => {
		await stubApi(page);
		await page.goto("/login");
		await waitForLoginForm(page);

		const serverFnCalls: string[] = [];
		page.on("request", (req) => {
			if (req.url().includes("_serverFn")) serverFnCalls.push(req.url());
		});

		await page.locator('input[name="email"]').fill("not-an-email");
		await page.locator('input[name="password"]').fill(ADMIN_PASSWORD);
		await page.getByRole("button", { name: "Iniciar Sesión" }).click();

		// The form is still on /login, with no session and no error banner: the
		// validator swallowed it, which is the correct outcome and also why this
		// is easy to miss as a bug when a real user reports "nothing happens".
		await expect(page).toHaveURL(/\/login$/);
		expect(
			serverFnCalls,
			"an invalid email was sent to the server function anyway",
		).toEqual([]);
		const token = await page.evaluate(() =>
			localStorage.getItem("role_admin_auth_token"),
		);
		expect(token).toBeNull();
	});

	/**
	 * ─── SAME DEFECT, SECOND SURFACE — both fixed by the same guard ──────────
	 *
	 * `redirectIfAuthenticated` is the mirror image of the layout guard, and it
	 * failed for the identical reason: it lives in `beforeLoad`, and `beforeLoad`
	 * is not re-run when the router hydrates the initial load. A signed-in
	 * operator who navigated to `/login` saw the login form instead of being
	 * sent to the panel.
	 *
	 * The impact was smaller than the blank page — nothing is exposed, and
	 * submitting the form again just re-establishes the same session — but it is
	 * a session bug, and a login screen rendered inside a panel the user is
	 * already authenticated into is a phishing-favourable surface.
	 *
	 * Same root cause, so same fix: `useRequireGuest()` in
	 * `features/auth/utils/guards.ts` is the hydration half that
	 * `beforeLoad` cannot be, and it reads the SAME token `beforeLoad` reads.
	 * One rule, two layers — not two rules that can drift apart.
	 */
	test("an authenticated operator is bounced off the login screen", async ({
		page,
	}) => {
		await stubApi(page);
		await signIn(page);

		await page.goto("/login");
		await expect(page).toHaveURL(/\/home$/);
	});
});
