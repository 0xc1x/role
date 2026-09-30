import { strings } from "../src/core/i18n/strings";

import {
	CONSUMER_TABS,
	consumerTab,
	consumerTablist,
	expect,
	stubSupabase,
	test,
	waitForConsumerShell,
} from "./fixtures";

/**
 * ─── Why the four tabs are worth an end-to-end spec ─────────────────────────
 *
 * `app/(consumer)/_layout.tsx` does not render a stock tab bar. It installs a
 * custom `Navbar` that captures the React Navigation props in a layout effect,
 * writes them into a Zustand store, and re-derives the active index from
 * `useSegments()` because the captured `state.index` arrives one commit late.
 * There is a comment in that file explaining exactly that, and a comment is
 * not a test: the whole design is "the pill highlights the route the user is
 * actually on, one frame early", and every way it can break (a segment that
 * stops matching a tab name, a tab that navigates but does not repaint) is
 * invisible to a unit test of the store.
 *
 * The other thing this file pins is that all four tabs are REACHABLE, which
 * is not the same as "the four files exist". `app/(consumer)/profile/index.tsx`
 * redirects a guest to `/login`, so a tab bar that is fully wired still
 * strands a signed-out visitor on the last tab. That is flow 3's job; here
 * the viewer is signed in, so this file is about routing and rendering.
 *
 * ─── Why the specs below navigate by CLICKING, and the last one does not ─────
 *
 * Clicking the tab bar is the path a real user takes to reach these screens,
 * and the thing being checked — that the pill follows the route and that tab N
 * is reachable from tab N-1 — is a sequence, so driving it that way is the
 * honest test rather than a set of deep links.
 *
 * The direct load of `/orders` is a DIFFERENT question, and it gets its own
 * test at the bottom of this file: `/orders` is claimed by two route groups at
 * once, and whether a consumer who follows a link to it lands on their orders
 * is not something clicking the tab bar can ever prove.
 */
test.describe("consumer tabs", () => {
	test("the tab bar offers the four consumer destinations", async ({
		page,
	}) => {
		await stubSupabase(page, { viewer: "consumer" });
		await page.goto("/");
		await waitForConsumerShell(page);

		// The four, by accessible name, scoped to the navigation tab bar. The
		// scope is load-bearing: screens add their own `role="tablist"`
		// controls, and the count below would otherwise include those.
		await expect(consumerTablist(page).getByRole("tab")).toHaveCount(
			CONSUMER_TABS.length,
		);
		for (const tab of CONSUMER_TABS) {
			await expect(consumerTab(page, tab.name)).toBeVisible();
		}
	});

	test("each tab navigates to its own route and renders its own screen", async ({
		page,
	}) => {
		await stubSupabase(page, { viewer: "consumer" });
		await page.goto("/");
		await waitForConsumerShell(page);

		// Every tab is checked in one test, in order, from the same starting
		// state. Four separate tests would rebuild the browser four times to
		// learn the same thing, and the thing being learned here is a SEQUENCE
		// — tab N is reachable while sitting on tab N-1 — which is exactly what
		// four independent tests would stop checking.
		//
		// `reached` is asserted at the end rather than trusting the loop: a
		// `toHaveURL` that silently passed because the regex matched the wrong
		// thing would still leave the list short, and a short list is the
		// failure a reader of this file actually wants to see.
		const reached: string[] = [];

		for (const tab of CONSUMER_TABS) {
			await consumerTab(page, tab.name).click();
			await expect(page).toHaveURL(new RegExp(`${tab.path}$`));
			reached.push(tab.path);
		}

		expect(reached).toEqual(["/", "/explore", "/orders", "/profile"]);

		// And the shell survives the round trip: the tab bar is owned by the
		// consumer layout, so a tab that navigated out of the group and never
		// came back would show up here as a missing tablist on the last step.
		await expect(consumerTablist(page)).toBeVisible();
	});

	test("the explore screen renders its own controls, not the home's", async ({
		page,
	}) => {
		await stubSupabase(page, { viewer: "consumer" });
		await page.goto("/");
		await waitForConsumerShell(page);
		await consumerTab(page, strings.explore.title).click();
		await expect(page).toHaveURL(/\/explore$/);

		// Asserting a screen renders SOMETHING is weak: an empty container also
		// "renders". These are all strings that exist ONLY on explore, so their
		// presence distinguishes the real screen from a blank one, from a home
		// screen that failed to unmount, and from the boot gate bouncing back.
		//
		// WHY THERE IS NO NEGATIVE ASSERTION ABOUT THE HOME SCREEN HERE: it was
		// written twice and deleted twice. React Navigation keeps an inactive
		// tab MOUNTED — the home screen's `LocationSelector` is still in the DOM
		// and still passes Playwright's visibility check, because the screen is
		// parked, not hidden. So `toHaveCount(0)` fails on a working app and
		// `toBeHidden()` fails on a working app. Asserting the POSITIVE
		// content of explore is the assertion that is actually true, and it is
		// the one that would catch a regression.
		await expect(
			page.getByPlaceholder(strings.explore.searchHint),
		).toBeVisible();
		await expect(
			page.getByText(strings.explore.viewMap, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.explore.filters, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.explore.categories, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.explore.tipTitle, { exact: true }),
		).toBeVisible();
	});

	test("the orders screen shows its own empty state for a viewer with none", async ({
		page,
	}) => {
		// The orders list answers with zero rows, which is the real state of a
		// consumer who has just signed up. `strings.orders.emptyActive` is the
		// copy for exactly that, so seeing it proves the screen read its query
		// and resolved the empty branch — not that it is stuck on a skeleton
		// that never resolves, and not that the tab silently fell back home.
		await stubSupabase(page, { viewer: "consumer" });
		await page.goto("/");
		await waitForConsumerShell(page);
		await consumerTab(page, strings.orders.tabTitle).click();

		await expect(page).toHaveURL(/\/orders$/);
		await expect(
			page.getByText(strings.orders.emptyActive, { exact: true }),
		).toBeVisible();
	});

	test("the profile screen shows the signed-in viewer's own data", async ({
		page,
	}) => {
		// The profile is the one tab that renders data belonging to the viewer,
		// so it is the one tab where "the screen mounted" and "the screen
		// mounted with THIS viewer's row" are different claims. Asserting the
		// name that came from the stubbed `profiles` row is what proves the
		// session was resolved and enriched rather than left as bare metadata.
		await stubSupabase(page, { viewer: "consumer" });
		await page.goto("/");
		await waitForConsumerShell(page);
		await consumerTab(page, strings.profile.title).click();

		await expect(page).toHaveURL(/\/profile$/);
		await expect(
			page.getByText("Consumidora de Prueba", { exact: true }),
		).toBeVisible();
		// The settings list is the profile's own content; its presence rules out
		// a screen that rendered the header and nothing else.
		await expect(
			page.getByText(strings.profile.settings, { exact: true }),
		).toBeVisible();
	});
});

/**
 * ─── `/orders` serves both audiences, and this is the one that proves it ─────
 *
 * `app/(consumer)/orders.tsx` and `app/(business)/orders.tsx` both map to the
 * web path `/orders`: route groups are erased from the URL, so the two collide
 * and expo-router gives the URL to the business group. A consumer arriving from
 * an email link or an order push was therefore answered by `BusinessLayout`,
 * whose role guard sent them to `/` — measured history
 * `/orders → /management → / → /`. `/explore` and `/profile` have no business
 * counterpart and survived, which is what made this a collision rather than
 * "deep links do not work on this PWA".
 *
 * The tiebreak now lives in `app/_layout.tsx` (see
 * `src/core/routing/shared-routes.ts` for the measurement that rules out the
 * group's own layout as the place to put it), so `/orders` reaches the consumer
 * tab and the business panel keeps the same URL for its own notifications.
 *
 * The `toHaveURL` below is NOT the discriminating assertion and is not what
 * this test is for: `page.goto("/orders")` puts `/orders` in the URL bar
 * before any redirect runs, so it passes against the broken build too. What
 * separates them is the orders screen's own empty-state copy — on the broken
 * build the page sat on the consumer home, which has no such string.
 */
test.describe("the shared /orders path", () => {
	test("a direct load of /orders should stay on the consumer orders tab", async ({
		page,
	}) => {
		await stubSupabase(page, { viewer: "consumer" });
		await page.goto("/orders");

		await expect(page).toHaveURL(/\/orders$/);
		await expect(
			page.getByText(strings.orders.emptyActive, { exact: true }),
		).toBeVisible();
	});
});
