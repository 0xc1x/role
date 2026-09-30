import { strings } from "../src/core/i18n/strings";

import {
	consumerTab,
	expect,
	loginAs,
	stubSupabase,
	test,
	waitForConsumerShell,
} from "./fixtures";

/**
 * ─── Why auth is worth an end-to-end spec when the backend already has one ──
 *
 * `apps/api/test/auth.e2e-spec.ts` proves the NestJS side: a real password
 * hash, a real JWT, a real role claim. None of that is what this file tests.
 *
 * Per ADR-0002 the mobile app never goes through the API for auth — it calls
 * GoTrue directly. So the API's login test says nothing about whether the app
 * does the right thing with a good session, and the questions that only exist
 * in the app are:
 *
 * 1. After a successful sign-in, does the app put the session where the NEXT
 *    cold start will find it? The session is the one piece of state that has
 *    to survive a reload, and it is written by a custom storage adapter
 *    (`createWebStorage` over `localStorage`, chosen by `Platform.OS`) — a
 *    plausible place for a silent, invisible break.
 * 2. Does a rejected sign-in leave the user where they were, with copy the
 *    app owns? `mapAuthError` translates GoTrue's English into es-ES by
 *    pattern, and the raw driver string is documented as never reaching the
 *    screen.
 *
 * What this file does NOT do is prove the credentials were right, or that RLS
 * accepts the resulting token. Those are the API's specs and the RLS specs,
 * and duplicating them here would test the database twice and the app zero
 * times.
 */
test.describe("sign in with email", () => {
	test("a valid sign-in survives a reload as the same viewer", async ({
		page,
	}) => {
		const supabase = await stubSupabase(page, { viewer: "guest" });
		await page.goto("/login");

		await loginAs(page, "consumer@role.test", "unaClaveLarga123");

		// The consumer shell, not a toast and not a spinner. A login that
		// "succeeds" but leaves the user on the form is the classic half-broken
		// session bug, and it is invisible to a test that only checks the request
		// went out.
		await waitForConsumerShell(page);

		// The app read the viewer's own row to enrich the profile. This is the
		// step that makes the ROLE come from the database instead of from signup
		// metadata — the repository is explicit that metadata "can change", so a
		// login that skipped this read would route a business owner into the
		// consumer shell and a consumer into the business panel.
		expect(supabase.callsTo("GET", "/rest/v1/profiles").length).toBeGreaterThan(
			0,
		);
		expect(supabase.callsTo("POST", "/auth/v1/token").length).toBe(1);

		// THE load-bearing assertion of this file. A session that lives only in
		// memory signs the user in and forgets them: the next cold start reads an
		// empty storage, `initialize()` resolves to `guest`, the profile gate
		// fires, and the user lands on the login form with no explanation.
		await page.reload();

		// A cold start for a BRAND NEW account lands on the onboarding pager,
		// not the home tab, because the "already seen" flag is keyed per viewer
		// and this account has never seen it. That is correct behaviour and it is
		// asserted rather than worked around: the flag is written for the guest
		// (`…:guest`) and this viewer is a user id, so the two genuinely do not
		// share a flag.
		await expect(
			page.getByText(strings.onboarding.skip, { exact: true }),
		).toBeVisible();

		// And now the claim itself: still signed in. Going straight to the
		// profile is the unambiguous probe, because the profile screen is the one
		// place in the app that answers "is there a session?" by what it does —
		// a guest is redirected to `/login` (flow 3) and a signed-in viewer gets
		// their own data. The name comes from the stubbed `profiles` row, so a
		// cached render from before the reload cannot satisfy it.
		await page.goto("/profile");
		await expect(page).toHaveURL(/\/profile$/);
		await expect(
			page.getByText("Consumidora de Prueba", { exact: true }),
		).toBeVisible();
		await consumerTab(page, strings.profile.title).click();
		await expect(page).toHaveURL(/\/profile$/);
	});

	test("a rejected sign-in stays on the form and shows the app's own copy", async ({
		page,
	}) => {
		// GoTrue answers a bad password with 400 and an English driver message.
		// The app must translate it and keep the user on the form, because the
		// alternative — signing in "optimistically" and failing later — would
		// strand the user on a profile screen with no data behind it.
		const supabase = await stubSupabase(page, {
			viewer: "guest",
			authFailure: {
				code: 400,
				error_code: "invalid_credentials",
				// The exact driver string: it names the auth table, and it must
				// never reach the DOM.
				message: "Invalid login credentials",
			},
		});
		await page.goto("/login");

		await loginAs(page, "consumer@role.test", "claveEquivocada999");

		// es-ES copy from the catalogue, and the classification is specific: an
		// invalid-credentials answer is not a validation error, so asserting the
		// generic fallback would pass even if the classification regressed.
		await expect(
			page.getByText(strings.auth.invalidCredentials, { exact: true }),
		).toBeVisible();

		// Still on the form: the user can correct the password without losing
		// what they typed or navigating back.
		await expect(page).toHaveURL(/\/login$/);
		await expect(
			page.getByLabel(strings.auth.email, { exact: true }),
		).toBeVisible();

		// The driver string is diagnostic only. It leaks the auth schema, and the
		// mapper's whole job is to keep it out of `message`.
		await expect(page.getByText("Invalid login credentials")).toHaveCount(0);

		// And no session was stored, so a reload is a guest — not a half-signed-in
		// user whose next request 401s.
		expect(supabase.callsTo("POST", "/rest/v1/profiles")).toHaveLength(0);
		await page.reload();
		await expect(page).toHaveURL(/\/login$/);
	});

	test("an incomplete form is refused before any request is made", async ({
		page,
	}) => {
		// The client-side floor under the login form. `validateLoginForm` owns
		// the rules and is unit-tested, so what matters here is that the screen
		// actually CALLS it and stays put — a form that submits an empty password
		// and shows a server error is a worse experience and a noisier log.
		const supabase = await stubSupabase(page, { viewer: "guest" });
		await page.goto("/login");

		// Submitting with nothing filled in. The button is labelled with the
		// catalogue's own login copy.
		await page.getByText(strings.auth.login, { exact: true }).last().click();

		await expect(
			page.getByText(strings.auth.requiredEmail, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.auth.requiredPassword, { exact: true }),
		).toBeVisible();
		expect(supabase.callsTo("POST", "/auth/v1/token")).toHaveLength(0);
	});
});
