import { strings } from "../src/core/i18n/strings";
import { formatMoney } from "../src/core/utils/formatters";
import { orderStatusLabels } from "../src/features/orders/domain/order";

import {
	BUSINESS_ID,
	businessBodies,
	businessOrderFixture,
	expect,
	stubSupabase,
	test,
	waitForBusinessShell,
	type StubOptions,
} from "./fixtures";

/**
 * ─── Why the orders catalog is the panel's most valuable spec ────────────────
 *
 * It is the screen a business owner opens more than any other, and it is the
 * only one whose headline numbers come from THREE different questions against
 * the same endpoint:
 *
 * ```
 * useBusinessOrderStats → countBusinessOrders(businessId, { status: "pending" })
 *                       → countBusinessOrders(businessId, { status: "ready_for_pickup" })
 *                       → countBusinessOrders(businessId, { status: "completed", from })
 * ```
 *
 * Three HEAD requests to `orders`, differing only by a `status` filter,
 * rendered as "Pendientes / Listos / Hoy". A stub that answered all three
 * identically would render "3 / 3 / 3" and look entirely healthy — so this
 * spec pins each number to its own request, and the rules below are the only
 * way to do it. `strings.business.ordersPendingStat` ("Pendientes") is the
 * only "Pendientes" in the catalog, which makes it a safe anchor for the row.
 *
 * The second half is the FILTER contract. `filterAndSortOrders` is pure and
 * has its own unit test, so what is left for a browser is the part the unit
 * test cannot see: that the status filter and the search box actually REACH
 * the server as PostgREST filters, and that a filtered-to-nothing list says
 * "no results" rather than the unfiltered empty state.
 */

/**
 * The three headline counts, each pinned to the `status` filter that produces
 * it. Distinct values on purpose — see the file header.
 */
const STATS_RULES = [
	{ method: "HEAD", path: "orders", query: "status=eq.pending", count: 3 },
	{
		method: "HEAD",
		path: "orders",
		query: "status=eq.ready_for_pickup",
		count: 1,
	},
	{ method: "HEAD", path: "orders", query: "status=eq.completed", count: 2 },
] as const;

/**
 * A business world with an order catalog.
 *
 * `bodies` has to be rebuilt from `businessBodies()` each time rather than
 * shared, because a spec that overrode `orders` must not leak that override
 * into the next test.
 */
function businessWithOrders(
	orders: unknown[],
	overrides: Partial<StubOptions> = {},
): StubOptions {
	return {
		viewer: "business",
		rules: [...STATS_RULES],
		bodies: businessBodies({ orders }),
		...overrides,
	};
}

const OFFER_TITLE = businessOrderFixture().offers.title;
const ORDER_NUMBER = businessOrderFixture().order_number;

test.describe("business orders catalog", () => {
	test("the headline row reads each number from its OWN status filter", async ({
		page,
	}) => {
		// THE assertion of this file, and the reason `STATS_RULES` exists.
		//
		// Three different numbers, one per status. The assertion that "three
		// numbers appeared" would pass against a repository that sent the
		// same filter to all three calls, and that regression renders a
		// screen indistinguishable from a healthy one.
		const supabase = await stubSupabase(page, businessWithOrders([]));

		await page.goto("/orders");
		await waitForBusinessShell(page);

		for (const label of [
			strings.business.ordersPendingStat,
			strings.business.ordersReadyStat,
			strings.business.ordersTodayStat,
		]) {
			await expect(page.getByText(label, { exact: true })).toBeVisible();
		}

		// The numbers live in the same cards as their labels. Scoping each
		// lookup to the label's own card is what ties "3" to "Pendientes"
		// instead of to whichever number happens to come first in the DOM.
		const card = (label: string) =>
			page.getByText(label, { exact: true }).locator("..");
		await expect(card(strings.business.ordersPendingStat)).toContainText("3");
		await expect(card(strings.business.ordersReadyStat)).toContainText("1");
		await expect(card(strings.business.ordersTodayStat)).toContainText("2");

		// And the request side, which is where the cause is visible. Without
		// this the DOM assertions above would still pass if the three numbers
		// came from three calls that all asked for the same thing.
		const headCalls = supabase.calls.filter(
			(c) => c.route === "HEAD /rest/v1/orders",
		);
		const askedFor = headCalls.map((c) => c.search).join(" | ");
		for (const status of ["pending", "ready_for_pickup", "completed"]) {
			expect(askedFor, `no head-count asked for status=${status}`).toContain(
				`status=eq.${status}`,
			);
		}
	});

	test("the catalog asks for THIS business's orders and no other tenant's", async ({
		page,
	}) => {
		// RLS is the data boundary (ADR-0002), so the panel's tenancy rests on
		// a policy over `orders.business_id`. The app still has to ASK for
		// this business — a panel that dropped the filter would render
		// correctly under a fixture that answers with the right rows anyway,
		// while asking the server for every tenant's orders. Only the request
		// can see that.
		//
		// The business id comes from `business_ownership`, NOT from the
		// signed-in user id. The two coincide in every single-tenant fixture,
		// which is precisely why this needs asserting: passing `profile.id`
		// where the business id belongs would typecheck, and only a wrong
		// `business_id` on the wire would show it.
		const supabase = await stubSupabase(
			page,
			businessWithOrders([businessOrderFixture()]),
		);

		await page.goto("/orders");
		await waitForBusinessShell(page);
		await expect(page.getByText(OFFER_TITLE, { exact: true })).toBeVisible();

		const listCalls = supabase.calls.filter(
			(c) => c.route === "GET /rest/v1/orders",
		);
		expect(listCalls.length, "the catalog never listed orders").toBeGreaterThan(
			0,
		);
		for (const call of listCalls) {
			expect(
				call.search,
				"the orders list was not scoped to the owner's business",
			).toContain(`business_id=eq.${BUSINESS_ID}`);
		}
	});

	test("a loaded order renders its offer, its number and its money", async ({
		page,
	}) => {
		// The mapper twin of the home screen's loaded-offers spec, one level
		// down. `mapOrderDetail` fills `offerTitle`, `businessName` and
		// `customerName` from three separate embedded objects and supplies a
		// literal fallback for each ("Oferta", "Negocio"), so a broken embed
		// still typechecks, still renders a card, and still passes any
		// assertion that only looks for "a row".
		await stubSupabase(page, businessWithOrders([businessOrderFixture()]));

		await page.goto("/orders");
		await waitForBusinessShell(page);

		await expect(page.getByText(OFFER_TITLE, { exact: true })).toBeVisible();
		await expect(
			page.getByText(
				strings.business.ordersOrderLine.replace("{n}", ORDER_NUMBER),
				{ exact: true },
			),
		).toBeVisible();
		// The price through the app's own formatter. A spec that hardcoded
		// "$60" would keep passing after the currency or the locale changed.
		await expect(
			page.getByText(formatMoney(60), { exact: true }),
		).toBeVisible();
	});

	test("the status filter reaches the server, not just the screen", async ({
		page,
	}) => {
		// The filter contract. `filterAndSortOrders` is pure and unit-tested;
		// what a browser can add is that the chosen status leaves the client
		// as a PostgREST filter. A local-only filter would look identical on
		// screen and would not scale past the first page.
		//
		// The whole sheet is driven — open, pick, apply — because the status
		// is a DRAFT until "Aplicar filtro" is pressed. A spec that stopped at
		// picking would prove the sheet opens, which is not the claim.
		const supabase = await stubSupabase(
			page,
			businessWithOrders([businessOrderFixture()]),
		);

		await page.goto("/orders");
		await waitForBusinessShell(page);
		await expect(page.getByText(OFFER_TITLE, { exact: true })).toBeVisible();
		const before = supabase.callsTo("GET", "/rest/v1/orders").length;

		await page
			.getByText(strings.business.ordersFilter, { exact: true })
			.first()
			.click();
		// "Confirmado" rather than "Pendiente": the card on screen is a
		// pending order, so filtering TO its own status would leave the list
		// unchanged and the assertion could not tell a working filter from a
		// broken one.
		await page.getByText(orderStatusLabels.confirmed, { exact: true }).click();
		await page
			.getByText(strings.business.ordersApplyFilter, { exact: true })
			.click();

		// The wait is on the request the click produced, never on a sleep.
		await expect
			.poll(() => {
				const after = supabase.callsTo("GET", "/rest/v1/orders");
				return after.length > before
					? after
							.slice(before)
							.map((c) => c.search)
							.join(" | ")
					: "";
			})
			.toContain("status=eq.confirmed");

		// And the screen acknowledged it: the active status becomes a
		// removable chip, which is the only way back out. Without that the
		// filter would be a one-way door.
		await expect(
			page.getByText(orderStatusLabels.confirmed, { exact: true }),
		).toBeVisible();
	});

	test("a search reaches the server as a PostgREST or-filter", async ({
		page,
	}) => {
		// `orderSearchOr` builds one `or=(…)` over the order number, the
		// offer title, the business name and the customer name. Asserting the
		// request means asserting the SEARCH SPREADS over those columns — a
		// narrower filter would still return the fixture's rows and render
		// the same card.
		const supabase = await stubSupabase(
			page,
			businessWithOrders([businessOrderFixture()]),
		);

		await page.goto("/orders");
		await waitForBusinessShell(page);
		await expect(page.getByText(OFFER_TITLE, { exact: true })).toBeVisible();
		const before = supabase.callsTo("GET", "/rest/v1/orders").length;

		// The hint is a catalogue string, so this locator survives a copy
		// change. It is a placeholder, and `SearchBar` forwards it.
		await page
			.getByPlaceholder(strings.business.ordersSearchHint)
			.fill(ORDER_NUMBER);
		// The input is debounced (`SEARCH_DEBOUNCE_MS`) on purpose; the wait
		// is on the request it produces, never on a sleep.
		await expect
			.poll(() => {
				const after = supabase.callsTo("GET", "/rest/v1/orders");
				return after.length > before
					? after
							.slice(before)
							.map((c) => c.search)
							.join(" | ")
					: "";
			})
			.toContain("or=");

		const asked = supabase
			.callsTo("GET", "/rest/v1/orders")
			.slice(before)
			.map((c) => c.search)
			.join(" | ");
		for (const column of [
			"order_number.ilike",
			"offers.title.ilike",
			"businesses.name.ilike",
			"profiles.full_name.ilike",
		]) {
			expect(asked, `the search skipped ${column}`).toContain(column);
		}
	});

	test("an empty catalog says so, and does not invent an error", async ({
		page,
	}) => {
		// The honest empty. The panel has THREE distinct emptinesses — no
		// active orders, no history, and no results for the current filter —
		// and conflating them is how an owner ends up believing they lost
		// sales. This pins the unfiltered one.
		await stubSupabase(page, businessWithOrders([]));

		await page.goto("/orders");
		await waitForBusinessShell(page);

		await expect(
			page.getByText(strings.business.ordersNoActiveTitle, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.business.ordersNoActiveBody, { exact: true }),
		).toBeVisible();
		// Not the FILTERED emptiness, and not a retry affordance: neither is
		// true of a catalog that simply has nothing in it.
		await expect(
			page.getByText(strings.allOffers.noResultsTitle, { exact: true }),
		).toHaveCount(0);
		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toHaveCount(0);
	});

	test("a failed catalog is a retryable error, NOT 'no orders'", async ({
		page,
	}) => {
		// The promise the home screen makes, in the place where it costs more:
		// an owner told "no active orders" when the network dropped will not
		// refresh, and will conclude a customer cancelled.
		//
		// Only the LIST is rejected. The three head-counts still answer, so
		// the headline row renders and the spec measures the list's error
		// branch rather than the whole screen.
		await stubSupabase(
			page,
			businessWithOrders([], {
				rules: [
					{
						method: "GET",
						path: "orders",
						status: 400,
						json: {
							code: "PGRST301",
							message: "permission denied for table orders",
						},
					},
					...STATS_RULES,
				],
			}),
		);

		await page.goto("/orders");
		await waitForBusinessShell(page);

		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.business.ordersNoActiveTitle, { exact: true }),
		).toHaveCount(0);
		// And the raw driver string stays out of the DOM: `toAppError` maps
		// the code to the app's own es-ES copy.
		await expect(page.getByText(/permission denied/i)).toHaveCount(0);
	});

	test("pressing retry re-asks the server and the list recovers", async ({
		page,
	}) => {
		// A retry button that does not retry teaches the user the app is
		// broken. The order matters: the network is recovered FIRST, so the
		// click is the only variable in the test — re-registering a route
		// mid-test would race the click and change what is under test.
		const supabase = await stubSupabase(
			page,
			businessWithOrders([businessOrderFixture()], {
				fail: {
					orders: { code: "57014", message: "statement timeout" },
				},
			}),
		);

		await page.goto("/orders");
		await waitForBusinessShell(page);

		const retry = page.getByText(strings.common.retry, { exact: true }).first();
		await expect(retry).toBeVisible();
		const before = supabase.callsTo("GET", "/rest/v1/orders").length;

		supabase.recover("orders");
		await retry.click();

		// The click produced a new request…
		await expect
			.poll(() => supabase.callsTo("GET", "/rest/v1/orders").length)
			.toBeGreaterThan(before);
		// …and the answer reached the screen. The offer title exists only in
		// the success body, so this cannot pass on a cached render.
		await expect(page.getByText(OFFER_TITLE, { exact: true })).toBeVisible();
	});

	test("a business with no businesses at all gets the panel's own prompt", async ({
		page,
	}) => {
		// `NoBusinessPrompt` is shared by all three tabs, so a suite that only
		// covered a loaded catalog would miss a regression where the guard
		// stopped firing on this tab specifically.
		await stubSupabase(page, {
			viewer: "business",
			bodies: businessBodies({ business_ownership: [] }),
		});

		await page.goto("/orders");
		await waitForBusinessShell(page);

		await expect(
			page.getByText(strings.business.noBusiness, { exact: true }),
		).toBeVisible();
		// Not the catalog's empty state: with no business there is no catalog
		// to be empty.
		await expect(
			page.getByText(strings.business.ordersNoActiveTitle, { exact: true }),
		).toHaveCount(0);
	});
});
