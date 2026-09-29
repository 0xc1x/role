import { strings } from "../src/core/i18n/strings";

import {
	consumerTab,
	consumerTablist,
	expect,
	stubSupabase,
	test,
	waitForConsumerShell,
} from "./fixtures";

/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * The profile screen opens with a client-side gate:
 *
 * ```tsx
 * if (initialized && status === "guest") router.replace("/login");
 * if (!initialized || status === "guest") return null;
 * ```
 *
 * That is a UI convenience, and it is easy to mistake for the security
 * boundary. It is not one. RLS is the boundary (ADR-0002): the app talks to
 * PostgREST directly, and a signed-out browser cannot read another viewer's
 * rows because the policy refuses it, not because a React effect moved the
 * user to a login screen.
 *
 * So this file asserts the redirect where it is honest about what it proves —
 * "the app does not pretend a signed-out visitor has a profile" — and, more
 * usefully, pins the thing that IS load-bearing: a guest must not have read
 * the viewer's private rows on the way to being redirected. A redirect that
 * happens AFTER fetching `/rest/v1/profiles` still leaks nothing to the user,
 * but it means the client is asking the server to identify somebody before it
 * has a session, and that is worth a red test when it changes.
 *
 * The other half of this file is the deep link. A guest landing on `/profile`
 * from a shared URL must get the same treatment as one who clicked the tab,
 * and that is a different code path: the boot gate in `app/index.tsx` runs
 * before the profile screen's own effect ever mounts.
 */
test.describe("auth gate for a signed-out visitor", () => {
	test("the profile tab sends a guest to the login screen", async ({
		page,
	}) => {
		const supabase = await stubSupabase(page, { viewer: "guest" });
		await page.goto("/");
		await waitForConsumerShell(page);

		await consumerTab(page, strings.profile.title).click();

		// Measured, not assumed: the assertion is on the destination and on the
		// login screen's own copy from the catalogue, so a redirect to a
		// "session expired" toast, a 404, or a blank stack all fail here.
		await expect(page).toHaveURL(/\/login$/);
		await expect(
			page.getByText(strings.auth.welcomeBack, { exact: true }),
		).toBeVisible();

		// And it did not get there by asking the server about the viewer first.
		const privateReads = supabase.calls.filter(
			(c) =>
				c.route === "GET /rest/v1/profiles" ||
				c.route === "GET /rest/v1/user_consents" ||
				c.route.startsWith("GET /auth/v1/"),
		);
		expect(
			privateReads.map((c) => c.route),
			"a guest must be redirected before any per-viewer read reaches the network",
		).toEqual([]);
	});

	test("a deep link into the profile sends a guest to the login screen", async ({
		page,
	}) => {
		// The same destination, reached without touching the tab bar. This is
		// the path a shared link takes, and it exercises `app/index.tsx`'s boot
		// gate rather than the profile screen's own effect — so it is a genuinely
		// different code path that happens to share an outcome. Both are pinned
		// because they are maintained separately.
		const supabase = await stubSupabase(page, { viewer: "guest" });

		await page.goto("/profile");

		await expect(page).toHaveURL(/\/login$/);
		await expect(
			page.getByText(strings.auth.welcomeBack, { exact: true }),
		).toBeVisible();
		expect(supabase.callsTo("GET", "/rest/v1/profiles")).toHaveLength(0);
	});

	test("the login screen offers the way back into the app", async ({
		page,
	}) => {
		// A gate with no exit is a dead end, and a dead end is indistinguishable
		// from a broken app in a smoke test. This asserts the recovery affordance
		// exists, which is the half of the gate that product cares about.
		await stubSupabase(page, { viewer: "guest" });
		await page.goto("/profile");
		await expect(page).toHaveURL(/\/login$/);

		await expect(
			page.getByText(strings.auth.noAccount, { exact: false }),
		).toBeVisible();
		await expect(
			page.getByText(strings.auth.signupFree, { exact: true }),
		).toBeVisible();
	});

	test("a signed-in consumer is NOT redirected away from the profile", async ({
		page,
	}) => {
		// The mirror image, and the one that catches an over-eager gate. A
		// redirect that fires on `initialized` alone (before the store has
		// resolved the session) would bounce every real user to the login
		// screen on a cold start, and a spec that only tested the guest case
		// would call that suite green.
		await stubSupabase(page, { viewer: "consumer" });

		await page.goto("/profile");

		await expect(page).toHaveURL(/\/profile$/);
		await expect(consumerTablist(page)).toBeVisible();
	});
});
