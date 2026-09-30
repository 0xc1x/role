import { strings } from "../src/core/i18n/strings";

import { consumerTablist, expect, stubSupabase, test } from "./fixtures";

/**
 * ─── Why this file is first, and why it is not a throwaway smoke test ───────
 *
 * Everything else in this suite assumes the PWA boots. That assumption is
 * worth more than it looks. The web build is not a dev server with live
 * reload: it is a ~7.6 MB production bundle produced by `expo export`,
 * guarded at startup by a Zod schema over the whole `EXPO_PUBLIC_*` surface
 * (`src/core/config/env.ts`), wrapped in a splash that self-releases after
 * 6 seconds so a hung session cannot trap the user on a white screen.
 *
 * Those three facts add up to a failure mode invisible to `bun test`: the
 * bundle fails to parse, the env validator throws, or the splash watchdog
 * fires and paints an empty app. All three look identical from outside — a
 * blank page — and all three would take the other flows down as an unexplained
 * timeout. So this file asserts the boot as a set of conditions rather than
 * as "something appeared".
 *
 * The assertion that carries the most weight is the negative one: that the
 * app reaches a real screen INSTEAD of falling through to the 6-second splash
 * watchdog. A blank app and a booted app are both "the DOM stopped changing",
 * and only one of them is a product.
 */
test.describe("PWA boot", () => {
	test("a first-time guest gets the onboarding pager, not a blank screen", async ({
		page,
	}) => {
		// `firstVisit` leaves the per-viewer onboarding flag unset, which is
		// exactly what a real first-time visitor has. `app/index.tsx` is the
		// single owner of "where does this viewer go", so this is where that
		// decision gets pinned for the guest case.
		await stubSupabase(page, { viewer: "guest", firstVisit: true });

		const bootErrors: string[] = [];
		page.on("pageerror", (e) => bootErrors.push(e.message));

		await page.goto("/");

		// The pager's own affordance, read from the catalog. Reaching it proves
		// the Zod env validator passed, the fonts resolved, the config
		// prefetch settled and the auth store left `loading` — the four gates
		// the root layout puts between a launch and a first screen.
		await expect(
			page.getByText(strings.onboarding.skip, { exact: true }),
		).toBeVisible();
		await expect(page).toHaveURL(/\/onboarding$/);

		expect(
			bootErrors,
			`the bundle threw while booting: ${bootErrors.join(" | ")}`,
		).toEqual([]);
	});

	test("the app paints before the splash watchdog has to rescue it", async ({
		page,
	}) => {
		await stubSupabase(page, { viewer: "guest", firstVisit: true });

		const startedAt = Date.now();
		await page.goto("/");
		await expect(
			page.getByText(strings.onboarding.skip, { exact: true }),
		).toBeVisible();
		const elapsed = Date.now() - startedAt;

		// The watchdog in `app/_layout.tsx` force-releases the splash after
		// 6 s REGARDLESS of whether the app is ready, so the splash's mere
		// disappearance proves nothing. Asserting the elapsed time is what
		// separates "the app reported itself ready" from "the escape hatch
		// fired and something eventually showed up": both look identical in a
		// DOM snapshot, and on a slower CI runner the second one becomes a
		// blank first paint with a healthy-looking test.
		expect(
			elapsed,
			`the app needed ${elapsed}ms to paint; the root layout's 6s splash watchdog expired first, so the app never reported itself ready`,
		).toBeLessThan(6_000);
	});

	test("a returning guest with a session lands on the consumer tabs", async ({
		page,
	}) => {
		await stubSupabase(page, { viewer: "consumer" });

		await page.goto("/");

		// With the onboarding flag set and a `user` role, `app/index.tsx`
		// resolves to `/(consumer)`. The tab bar is the assertion: it is the one
		// element that can only exist once the boot gate, the auth store and
		// the consumer layout have all agreed on the same viewer.
		await expect(consumerTablist(page)).toBeVisible();
		await expect(page).not.toHaveURL(/\/onboarding$/);
	});

	test("a guest boot authenticates nothing", async ({ page }) => {
		// A signed-out visitor has no reason to make the server answer "who am
		// I". `getSession()` reads the session the browser already holds, and
		// `initialize()` short-circuits to `guest` when it is empty. If a
		// future change made the boot ask `/auth/v1/user` or read `profiles`
		// before a session exists, that would be a real privacy change — a
		// signed-out visitor's device asking the server to identify it before
		// the user has consented to anything. RLS is the data boundary on the
		// server side (ADR-0002); this is the client half of the same promise.
		const supabase = await stubSupabase(page, { viewer: "guest" });
		await page.goto("/");
		await expect(consumerTablist(page)).toBeVisible();

		const authenticatedReads = supabase.calls.filter(
			(c) =>
				c.route.startsWith("GET /auth/v1/") ||
				c.route === "GET /rest/v1/profiles" ||
				c.route === "GET /rest/v1/user_consents",
		);
		expect(
			authenticatedReads.map((c) => c.route),
			"a signed-out boot must not ask the server to identify the viewer",
		).toEqual([]);
	});

	test("each offer section asks the catalogue for the slice it promises", async ({
		page,
	}) => {
		// The home screen is three row sections, a column section and a
		// business row, and every offer section goes through the same
		// `active_offers_near` RPC with different parameters. So the SECTION
		// TITLES in the catalogue are a claim about data, not about layout:
		// `strings.home.ultimasHoras` ("Últimas Horas") is only honest if the
		// request behind it sorts by pickup window and bounds the horizon to
		// the 3 hours `expiringSoonWindowHours` declares. A screen that
		// rendered the right heading over the wrong query would look perfect in
		// a screenshot and ship a lie.
		//
		// Asserted on the request bodies rather than on the rendered cards: the
		// bodies are fixed by the repository, so this does not race the render
		// the way a "count the requests that happened so far" assertion would.
		const supabase = await stubSupabase(page, { viewer: "guest" });
		await page.goto("/");
		await expect(consumerTablist(page)).toBeVisible();

		const offerCalls = () =>
			supabase.calls
				.filter((c) => c.route === "POST /rest/v1/rpc/active_offers_near")
				.map((c) => c.body as Record<string, unknown>);

		const askedFor = (patch: Record<string, unknown>) =>
			offerCalls().filter((body) =>
				Object.entries(patch).every(([key, value]) => body[key] === value),
			).length;

		// The three location-free offer sections each fire their own request, and
		// nothing forces them to fire in a particular order or at the same
		// moment. Asserting the breakdown right after the shell appears is
		// therefore a race: on a loaded machine the recent and popular rows have
		// not asked yet, and the test fails on a correct app. Waiting for the
		// count is a condition, not a sleep, and it is the condition that matters
		// — the breakdown below is only meaningful once all three have spoken.
		await expect.poll(() => offerCalls().length).toBeGreaterThanOrEqual(3);

		// "Últimas Horas" — the soonest-to-expire window, not the newest. Both
		// parts matter: a `pickup_end` sort with no horizon bound is "expiring
		// eventually", which is a different promise from the one the heading
		// makes.
		expect(
			askedFor({ p_sort: "pickup_end", p_expiring_within_hours: 3 }),
			"the expiring section must bound the horizon, not just re-sort",
		).toBe(1);
		// The default ordering, which is what the popular and recent rows use.
		expect(askedFor({ p_sort: "created_at" })).toBe(2);

		// "Cerca de Ti" is location-gated: `useNearbyOffersHook` is
		// `enabled: lat != null && lng != null`, and a visitor who has never
		// chosen an address has neither. The app must therefore NOT ask for a
		// distance-sorted list it has no coordinates for. This is the
		// interesting half of the screen, and getting it wrong in either
		// direction is a bug: firing the query without a location throws
		// "Ubicación requerida" and paints an error row, and rendering the
		// section without the query would be a "near you" heading over nothing.
		expect(
			askedFor({ p_sort: "distance" }),
			"a visitor with no address must not trigger a distance-sorted offer query",
		).toBe(0);
	});
});
