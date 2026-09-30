import { strings } from "../src/core/i18n/strings";

import {
	consumerTablist,
	expect,
	offerFixture,
	stubSupabase,
	test,
} from "./fixtures";

/**
 * ─── Why the home screen's data states are the highest-value specs here ──────
 *
 * The home screen is a stack of independent sections, each with its own query
 * and its own outcome. Two of those outcomes are the same pixels.
 *
 * `OfferRowView` (`src/features/home/components/OfferRowSection.tsx`) opens
 * with
 *
 * ```tsx
 * if (!isLoading && !isError && offers && offers.length === 0) return null;
 * ```
 *
 * — an empty list renders NOTHING AT ALL, not an empty state; the section
 * header goes with it. So "the catalogue is empty" and "the section never
 * mounted" are indistinguishable on screen. That is a defensible design (four
 * stacked empty-state cards on a home screen is worse than silence) and it is
 * exactly why the error case needs a test.
 *
 * The error branch is where that decision turns dangerous, and the code says
 * so itself:
 *
 * > Un fallo de red o de RLS no es un marketplace vacío: nunca usar aquí el
 * > copy de "sin ofertas".
 *
 * That is a promise about the difference between a broken connection and an
 * empty catalogue, and promises like that rot quietly: somebody adds a
 * fallback, somebody else reuses the empty branch for the error branch, and a
 * user with no signal is told there is simply nothing to eat. So the error
 * case is asserted first and hardest, because it is the one that matters.
 */
test.describe("home offers: empty, failed, and loaded", () => {
	test("a failed offer query is a retryable error, NOT an empty marketplace", async ({
		page,
	}) => {
		// Only the offer RPC is rejected; the config prefetch and the promo
		// slider answer normally. A total black hole also breaks the splash, so
		// a blanket failure would measure the 6-second watchdog instead of the
		// error state this spec is about.
		const supabase = await stubSupabase(page, {
			viewer: "guest",
			fail: {
				active_offers_near: {
					code: "PGRST301",
					message: "permission denied for function active_offers_near",
				},
			},
		});
		await page.goto("/");
		await expect(consumerTablist(page)).toBeVisible();

		// The section is still there. An error that removes the section header
		// is, to the user, indistinguishable from a section that never existed.
		//
		// Three, not four: "Cerca de Ti" is location-gated
		// (`useNearbyOffersHook` is `enabled: lat != null && lng != null`) and
		// this visitor has no address, so it never asks. Asserting three rather
		// than four is the app's behaviour being pinned, not a fudge.
		for (const heading of [
			strings.home.ultimasHoras,
			strings.home.recienAgregados,
			strings.home.ofertasPopulares,
		]) {
			await expect(page.getByText(heading, { exact: true })).toBeVisible();
		}

		// Each failed section offers the app's own way out, and there is
		// exactly one per failed section. The count is the assertion that
		// discriminates: a single shared retry (or a retry on a section that
		// succeeded) would both fail here.
		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toHaveCount(3);

		// THE assertion this file exists for. A network failure is not an empty
		// marketplace, and the app's own copy contract says so. If someone ever
		// reuses the empty branch for the error branch, this goes red — which is
		// the entire point of the file.
		await expect(
			page.getByText(strings.home.noOffers, { exact: true }),
		).toHaveCount(0);

		// The failure was CLASSIFIED, not passed through raw. `toAppError` maps
		// PGRST301 to the `forbidden` bucket, and the raw driver message leaks
		// the function name, so it must never reach the DOM.
		await expect(page.getByText(/permission denied/i)).toHaveCount(0);

		// The rest of the screen kept working: only the offer RPC failed. A
		// blank screen would satisfy every assertion above except this one.
		await expect(supabase.callsTo("GET", "/rest/v1/slides")).toHaveLength(1);
		await expect(
			page.getByText(strings.home.ecoBannerTitle, { exact: false }),
		).toBeVisible();
	});

	test("an empty catalogue removes the offer sections instead of faking them", async ({
		page,
	}) => {
		// The honest form of "no offers": no section headers, no cards, and no
		// error affordance either. An empty catalogue that rendered retry
		// buttons would be the same confusion in the other direction — three
		// "try again" buttons for a marketplace that is simply empty today.
		await stubSupabase(page, { viewer: "guest", defaultBody: [] });
		await page.goto("/");
		await expect(consumerTablist(page)).toBeVisible();

		for (const heading of [
			strings.home.ultimasHoras,
			strings.home.recienAgregados,
			strings.home.ofertasPopulares,
			strings.home.cercaDeTi,
		]) {
			await expect(page.getByText(heading, { exact: true })).toHaveCount(0);
		}
		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toHaveCount(0);

		// The screen itself is alive. Without this, every assertion above would
		// also pass on a white page — which is the failure mode this file exists
		// to keep out of the suite.
		await expect(
			page.getByText(strings.home.changeLocation, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.home.ecoBannerTitle, { exact: false }),
		).toBeVisible();
	});

	test("a transient failure is absorbed by the query's own retry", async ({
		page,
	}) => {
		// The case the first draft of this file got wrong, and the reason is
		// worth writing down. `failTimes: 1` was meant to produce an error and
		// then a recovery, and it produced no error at all: TanStack Query
		// retries by default, so the first offer request failed, the query
		// re-asked, and the second attempt succeeded before React ever painted
		// the error branch.
		//
		// That is the CORRECT product behaviour — a user on a flaky connection
		// should see the offers, not a red card that blinks — so it is asserted
		// as a first-class case rather than worked around. The interesting part
		// is that a retry really happened: asserting only "the data is there"
		// would also pass on a first-try success, and would prove nothing about
		// resilience.
		const supabase = await stubSupabase(page, {
			viewer: "guest",
			failTimes: 1,
			fail: {
				active_offers_near: {
					code: "57014",
					message: "canceling statement due to statement timeout",
				},
			},
			bodies: { active_offers_near: [offerFixture()] },
		});
		await page.goto("/");
		await expect(consumerTablist(page)).toBeVisible();
		await expect(
			page.getByText(offerFixtureTitle, { exact: true }).first(),
		).toBeVisible();

		// More than one request: the first was rejected and the app re-asked.
		expect(
			supabase.callsTo("POST", "/rest/v1/rpc/active_offers_near").length,
		).toBeGreaterThan(1);

		// And the user never saw the failure. An error state that flashes for
		// one frame is not something `toBeVisible` can catch, so the strongest
		// available claim is that no retry affordance survived the recovery.
		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toHaveCount(0);
	});

	test("pressing retry re-asks the server and the section recovers", async ({
		page,
	}) => {
		// An error state with a retry button that does not retry is worse than
		// no button: it teaches the user the app is broken. The failure here is
		// persistent, so the app's own retry budget is exhausted and the error
		// branch is what the user is actually looking at when they press the
		// button.
		const supabase = await stubSupabase(page, {
			viewer: "guest",
			fail: {
				active_offers_near: {
					code: "57014",
					message: "canceling statement due to statement timeout",
				},
			},
			bodies: { active_offers_near: [offerFixture()] },
		});
		await page.goto("/");
		await expect(consumerTablist(page)).toBeVisible();

		const retry = page.getByText(strings.common.retry, { exact: true }).first();
		await expect(retry).toBeVisible();
		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toHaveCount(3);
		const before = supabase.callsTo(
			"POST",
			"/rest/v1/rpc/active_offers_near",
		).length;

		// The network comes back, then the user presses the button. The order
		// matters: recovering first keeps the click as the only variable.
		supabase.recover("active_offers_near");
		await retry.click();

		// The click produced a new request…
		await expect
			.poll(
				() =>
					supabase.callsTo("POST", "/rest/v1/rpc/active_offers_near").length,
			)
			.toBeGreaterThan(before);

		// …and the answer reached the screen. The offer title exists only in
		// the success body, so this cannot pass on a cached render.
		await expect(
			page.getByText(offerFixtureTitle, { exact: true }).first(),
		).toBeVisible();

		// The error affordances went away, and the assertion is on the DIRECTION
		// rather than on an exact remainder. The first draft pinned "exactly two
		// left" and it failed about one run in three, legitimately: recovering
		// the endpoint also releases the other two sections' own retry backoff,
		// so how many are still showing an error depends on how far each had got
		// — a fact about the scheduler, not about the app. "Fewer errors than
		// before, and the one the user retried is now showing data" is the claim
		// that is actually true, and it still fails if the button is inert.
		await expect
			.poll(() => page.getByText(strings.common.retry, { exact: true }).count())
			.toBeLessThan(3);
	});

	test("loaded offers render data from the whole embedded row", async ({
		page,
	}) => {
		// The positive case, and the one that catches a mapper regression.
		// `OfferCard` shows the offer title, the business name and the pickup
		// deadline; those come from three different levels of the embedded
		// PostgREST row (`offers` → `businesses` → `business_locations`), so a
		// broken embed still typechecks and still renders a card — just a card
		// with a blank merchant line and no place to pick up.
		await stubSupabase(page, {
			viewer: "guest",
			bodies: { active_offers_near: [offerFixture()] },
		});
		await page.goto("/");
		await expect(consumerTablist(page)).toBeVisible();

		// The section header is present precisely because the list is non-empty:
		// that is the same header the empty catalogue removes, so seeing it here
		// is the assertion that distinguishes loaded from empty.
		await expect(
			page.getByText(strings.home.ofertasPopulares, { exact: true }),
		).toBeVisible();

		// One card per location-free offer section. Asserting the count instead
		// of taking `.first()` is deliberate: it proves every section that asked
		// got an answer and rendered it, where `.first()` would be satisfied by
		// one section working and two silently empty.
		await expect(
			page.getByText(offerFixtureTitle, { exact: true }),
		).toHaveCount(3);
		// The embedded business, not the offer's own `business_id`.
		await expect(
			page.getByText(offerFixtureBusiness, { exact: true }),
		).toHaveCount(3);
		// And no error affordance anywhere: a successful load must not leave one
		// behind.
		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toHaveCount(0);
	});
});

const offerFixtureTitle = "Mystery Box de Panadería";
const offerFixtureBusiness = "Panadería La Espiga";
