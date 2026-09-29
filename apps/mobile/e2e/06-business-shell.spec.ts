import { strings } from "../src/core/i18n/strings";

import {
	BUSINESS_TABS,
	businessBodies,
	businessOrderFixture,
	businessTab,
	businessTablist,
	consumerTablist,
	expect,
	stubSupabase,
	test,
	waitForBusinessShell,
} from "./fixtures";

/**
 * The consumer orders screen's second segment, "Pasados".
 *
 * Derived from the catalog rather than typed, because the panel's second
 * segment is "Historial" and that is the whole point: this string is how the
 * spec tells the two orders screens apart. The template is
 * `"Pasados ({n})"`, and the screen renders it either with the count
 * interpolated or with the ` ({n})` suffix stripped when counts are still
 * loading, so the assertion matches on the stem.
 */
const CONSUMER_PAST_TAB = strings.orders.tabPast.split(" (")[0] as string;

/**
 * ─── Why the panel's front door is worth a spec ──────────────────────────────
 *
 * The business panel is a different APPLICATION SHELL, not a set of screens
 * under the consumer one. `app/(business)/_layout.tsx` re-declares its own
 * `<Tabs>` (Productos / Pedidos / Gestión) and gates the whole group on
 * `profile?.role`, answering a non-business viewer with `<Redirect href="/" />`.
 *
 * That guard is the reason this file is not redundant with the auth-gate spec.
 * A consumer following a "mis pedidos" link to `/orders` used to land in this
 * panel, get bounced to the home by the role guard, and see no explanation —
 * the defect `src/core/routing/shared-routes.ts` documents and fixes at the
 * ROOT layout. From inside a browser the fix is only provable in one direction
 * at a time, and both directions are asserted here:
 *
 *   - a `business` viewer opening `/orders` gets the panel's Pedidos;
 *   - a `user` viewer opening `/orders` gets the consumer's, NOT a bounce.
 *
 * The second is the one that regressed. Asserting only "the business viewer
 * sees the panel" would have stayed green through the entire bug.
 */
test.describe("business shell", () => {
	test("a business session reaches the panel and not the consumer shell", async ({
		page,
	}) => {
		const bootErrors: string[] = [];
		page.on("pageerror", (e) => bootErrors.push(e.message));

		await stubSupabase(page, {
			viewer: "business",
			bodies: businessBodies(),
		});

		await page.goto("/");
		await waitForBusinessShell(page);

		// The three panel destinations, each with the catalog's own label.
		for (const tab of BUSINESS_TABS) {
			await expect(businessTab(page, tab.name)).toBeVisible();
		}

		// And it is the OTHER shell. The consumer bar is not merely absent from
		// this assertion's happy path: a panel that mounted the consumer
		// tablists alongside its own would still pass a "panel tab is visible"
		// check, and the two audiences would be one tap apart.
		await expect(consumerTablist(page)).toHaveCount(0);

		expect(
			bootErrors,
			`the bundle threw while booting: ${bootErrors.join(" | ")}`,
		).toEqual([]);
	});

	test("a business session opening /orders gets the PANEL's orders", async ({
		page,
	}) => {
		// The colliding path, from the owner's side. The panel's own Pedidos
		// is a different route object from the consumer's — the screen is the
		// one that knows about a branch selector and a business status
		// filter — so asserting the tab bar is on the panel AND a
		// panel-only string is on screen is what distinguishes "the panel
		// served /orders" from "the consumer happened to answer it".
		//
		// The marker is `ordersPendingStat` ("Pendientes"), NOT the screen
		// title. Both orders screens title themselves "Pedidos" — see
		// `strings.orders.tabTitle` and `strings.business.ordersTitle` — so a
		// title assertion cannot tell the two shells apart, and the first
		// draft of this spec proved exactly that by failing on a passing app.
		// "Pendientes" appears exactly once in the whole catalog: in the
		// business headline row.
		await stubSupabase(page, {
			viewer: "business",
			bodies: businessBodies({ orders: [businessOrderFixture()] }),
		});

		await page.goto("/orders");
		await waitForBusinessShell(page);

		await expect(businessTablist(page)).toBeVisible();
		await expect(
			page.getByText(strings.business.ordersPendingStat, { exact: true }),
		).toBeVisible();
		await expect(businessTab(page, strings.business.orders)).toHaveAttribute(
			"aria-selected",
			"true",
		);
		// The consumer bar is the thing that must NOT be here.
		await expect(consumerTablist(page)).toHaveCount(0);
	});

	test("a CONSUMER opening /orders keeps the consumer orders, not a bounce", async ({
		page,
	}) => {
		// The regression this suite would have missed. Before
		// `decideSharedRoute`, `/orders` resolved to the `(business)` group,
		// whose role guard answered `<Redirect href="/" />` — so a consumer
		// following a link to their own orders was dumped on the home screen
		// with nothing said about why.
		//
		// The assertion is a PAIR, and both halves matter: the consumer bar
		// is present (they landed in their own shell) AND the panel's
		// "Pedidos" title is absent (they did not land in the business
		// shell). Asserting only the first would pass on the buggy build,
		// where the redirect eventually resolved to the consumer layout too.
		await stubSupabase(page, { viewer: "consumer", defaultBody: [] });

		await page.goto("/orders");

		await expect(consumerTablist(page)).toBeVisible();
		await expect(businessTablist(page)).toHaveCount(0);
		// The panel's headline row is the discriminator: "Pendientes" is a
		// business-only string, and its absence is what says the consumer
		// screen is the one on the stack.
		await expect(
			page.getByText(strings.business.ordersPendingStat, { exact: true }),
		).toHaveCount(0);
		// And the consumer's own orders screen is the one rendering — "Pasados"
		// is unique to the consumer segmented control (the panel's second
		// segment is "Historial").
		await expect(
			page.getByText(CONSUMER_PAST_TAB, { exact: false }),
		).toBeVisible();
		await expect(page).toHaveURL(/\/orders$/);
	});

	test("the panel is a different tab bar, not the consumer's relabelled", async ({
		page,
	}) => {
		// The count is the assertion that discriminates. A panel that
		// accidentally reused the consumer layout would still show a "Pedidos"
		// tab; what it would NOT show is the consumer's Inicio, nor the
		// panel's own third destination. Checking the exact tab set is what
		// makes "they are different shells" a claim instead of a vibe.
		await stubSupabase(page, {
			viewer: "business",
			bodies: businessBodies(),
		});
		await page.goto("/");
		await waitForBusinessShell(page);

		await expect(businessTablist(page).getByRole("tab")).toHaveCount(
			BUSINESS_TABS.length,
		);
		await expect(
			businessTablist(page).getByRole("tab", { name: strings.home.title }),
		).toHaveCount(0);
	});
});
