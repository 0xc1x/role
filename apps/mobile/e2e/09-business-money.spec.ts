import { MONTHS_SHORT_ES } from "../src/core/i18n/dates";
import { strings } from "../src/core/i18n/strings";
import { formatMoney, formatPercent } from "../src/core/utils/formatters";
import { PAYOUT_STATUS_LABELS } from "../src/features/business/domain/business";
import { statsRangeFor } from "../src/features/business/domain/stats";

import {
	BUSINESS_ID,
	businessBodies,
	expect,
	payoutFixture,
	stubSupabase,
	test,
	type StubOptions,
} from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * ─── Why the two money screens are the ones that must not be wrong ───────────
 *
 * Every other panel screen shows data. These two show the owner's income, and
 * a wrong number here is not a cosmetic bug: it is money the owner either
 * over-remits or under-remits on.
 *
 * They also have the two shapes of money bug that are invisible to a
 * screenshot, which is what the rest of this file is built around:
 *
 * 1. **An aggregate derived from a difference.** `getBusinessStats` calls
 *    `business_sales_stats` TWICE — current period and previous period — and
 *    `revenueChange` is `(current - previous) / previous`. A stub answering
 *    both calls with the same body renders `+0%`, and "+0%" on a stats screen
 *    is indistinguishable from a business that did not move. The window is in
 *    the POST body, so the two calls are told apart BY their window.
 *
 * 2. **An aggregate that must NOT follow the filter.** `getPayoutTotals`
 *    deliberately reads every payout with its own unfiltered query, and the
 *    hook says why: "so the cards never read 0 under a filter". If that
 *    separation were lost, filtering the list to "Completados" would make the
 *    "Por procesar" balance read $0 — telling an owner they have nothing
 *    incoming while they are owed the exact amount on screen one line below.
 *
 * The fixtures below are built so that BOTH numbers are wrong if the code is:
 * `net_amount` differs from `gross_amount`, and the two periods differ.
 */

/**
 * The two `business_sales_stats` windows, exactly as the repository derives
 * them.
 *
 * ─── Why the previous window is NOT `statsRangeFor(period, -1)` ─────────────
 *
 * `statsRangeFor("week", -1)` returns the previous CALENDAR week, and the
 * first draft of this helper used it. The repository does not:
 *
 * ```ts
 * const durationMs = end.getTime() - start.getTime();
 * const prevStart = new Date(start.getTime() - durationMs);
 * const prevEnd = start;
 * ```
 *
 * so the baseline is a rolling window of the SAME LENGTH ending where the
 * current one begins — for a partial current week, a few days, not seven.
 * That is a defensible like-for-like comparison of a running total (it is
 * what the `durationMs` line is FOR), so it is NOT changed here. But a spec
 * that stubs the wrong window does not notice: the missed rule falls through
 * to the catch-all, `mapSalesStats([])` yields zeros, and `change(4000, 0)`
 * returns the `previous === 0 ? 100` branch — so the screen confidently
 * rendered "+100%" and the test would have asserted nothing real.
 *
 * Hence: the helper mirrors the repository's arithmetic, with a comment
 * pointing at the line it is mirroring.
 */
function statsWindows(now = new Date()) {
	const current = statsRangeFor("week", 0, now);
	const durationMs = current.end.getTime() - current.start.getTime();
	const previousStart = new Date(current.start.getTime() - durationMs);
	return {
		current: {
			p_business_id: BUSINESS_ID,
			p_from: current.start.toISOString(),
			p_to: current.end.toISOString(),
		},
		previous: {
			p_business_id: BUSINESS_ID,
			p_from: previousStart.toISOString(),
			// `prevEnd` is the current `start`, verbatim — not re-rounded.
			p_to: current.start.toISOString(),
		},
	};
}

/** One row of `business_sales_stats`, in the shape the RPC projects. */
function salesStatsRow(overrides: Record<string, unknown> = {}) {
	return {
		orders_count: 8,
		revenue: 4000,
		top_products: [
			{ name: "Mystery Box de Panadería", sold: 5, revenue: 2500 },
			{ name: "Pastel de Tarot", sold: 3, revenue: 1500 },
		],
		daily: [{ day: "2026-09-28", orders: 8, revenue: 4000 }],
		...overrides,
	};
}

const CURRENT_REVENUE = 4000;
const PREVIOUS_REVENUE = 3200;
const CURRENT_ORDERS = 8;
const PREVIOUS_ORDERS = 4;

/**
 * The KPI card that owns `label`.
 *
 * Climbing two levels is not arbitrary: `KpiCard` renders the label inside
 * `CardHeader` and the value inside a SIBLING `CardContent`, so the nearest
 * ancestor holding both is the card. Scoping matters because a value like
 * `$4,000` legitimately appears twice on this screen — once as the KPI, once
 * as that day's bar in the daily chart — and an unscoped `getByText` is then
 * a strict-mode violation rather than an assertion.
 *
 * `toContainText` is the matcher rather than `toBeVisible` on a value,
 * because the trend row renders `"+"` and `"25%"` as two expressions inside
 * one `AppText`, which land as two DOM text nodes that no single
 * `getByText` can match.
 */
function kpiCard(page: Page, label: string) {
	return page.getByText(label, { exact: true }).locator("../..");
}

/** The exact expected growth, computed the way the repository computes it. */
const REVENUE_CHANGE_PCT =
	((CURRENT_REVENUE - PREVIOUS_REVENUE) / PREVIOUS_REVENUE) * 100;

function statsWorld(overrides: Partial<StubOptions> = {}): StubOptions {
	const { current } = statsWindows();
	return {
		viewer: "business",
		rules: [
			{
				method: "POST",
				path: "business_sales_stats",
				// The CURRENT window is identified by its `p_from`, which is
				// the deterministic edge: `statsRangeFor` rounds the start of
				// the week to midnight UTC.
				body: (b) => (b as { p_from?: string })?.p_from === current.p_from,
				json: [
					salesStatsRow({
						orders_count: CURRENT_ORDERS,
						revenue: CURRENT_REVENUE,
					}),
				],
			},
			{
				// Everything else on this endpoint is the comparison window.
				// Its `p_to` is the current `p_from` verbatim, which is the
				// edge the request-level test asserts — see `statsWindows`.
				method: "POST",
				path: "business_sales_stats",
				json: [
					salesStatsRow({
						orders_count: PREVIOUS_ORDERS,
						revenue: PREVIOUS_REVENUE,
					}),
				],
			},
		],
		bodies: businessBodies(),
		...overrides,
	};
}

test.describe("business stats: money", () => {
	test("the revenue KPI is the current period, not the previous one", async ({
		page,
	}) => {
		// The two windows are told apart BY their `p_from`. If the
		// repository swapped them — or sent one window twice — the screen
		// would still render a plausible revenue figure and a plausible
		// growth figure. Asserting the exact number is what pins WHICH answer
		// landed where.
		await stubSupabase(page, statsWorld());

		await page.goto(`/business/${BUSINESS_ID}/stats`);
		await expect(
			page.getByText(strings.business.revenue, { exact: true }),
		).toBeVisible();

		await expect(kpiCard(page, strings.business.revenue)).toContainText(
			formatMoney(CURRENT_REVENUE),
		);
		// The previous period's revenue must NOT be on the KPI.
		await expect(kpiCard(page, strings.business.revenue)).not.toContainText(
			formatMoney(PREVIOUS_REVENUE),
		);
	});

	test("the growth percentage is computed from BOTH windows", async ({
		page,
	}) => {
		// THE assertion of this file.
		//
		// A stub that answered both calls with the same body would render
		// "+0%", and a stats screen showing "+0%" looks exactly like a quiet
		// week. `formatPercent` is the app's own rounding, so the expected
		// value is derived rather than pasted.
		await stubSupabase(page, statsWorld());

		await page.goto(`/business/${BUSINESS_ID}/stats`);
		await expect(
			page.getByText(strings.business.revenue, { exact: true }),
		).toBeVisible();

		// +25% (4000 vs 3200), on the revenue card, next to the label that
		// makes the number mean something to a human reading it.
		const revenue = kpiCard(page, strings.business.revenue);
		await expect(revenue).toContainText(
			`+${formatPercent(REVENUE_CHANGE_PCT)}`,
		);
		await expect(revenue).toContainText(strings.business.vsPrevious);
		// And the number a single-window stub would produce — +0% — is on
		// screen nowhere. Without this the test would also pass if BOTH
		// windows returned 4000.
		await expect(page.getByText("+0%", { exact: false })).toHaveCount(0);
	});

	test("the stats query asks for two DIFFERENT windows", async ({ page }) => {
		// The request-level twin. If a regression collapsed the two calls into
		// one, the DOM assertions above would still pass on a warm React Query
		// cache; this is where the collapse is visible.
		//
		// The window edges are asserted where they are DETERMINISTIC. The
		// current window's `p_from` is midnight UTC of the week, so it is
		// comparable as a string. The comparison window's `p_to` is that
		// same value verbatim (`prevEnd = start`), which makes the two
		// windows provably ADJACENT without pinning either `Date.now()`.
		// Asserting `p_to` of the current window would compare two clock
		// reads taken milliseconds apart and fail against a correct app.
		const supabase = await stubSupabase(page, statsWorld());

		await page.goto(`/business/${BUSINESS_ID}/stats`);
		await expect(
			page.getByText(strings.business.revenue, { exact: true }),
		).toBeVisible();

		const { current } = statsWindows();
		const rpcCalls = supabase
			.callsTo("POST", "/rest/v1/rpc/business_sales_stats")
			.map(
				(c) =>
					(c.body ?? {}) as {
						p_from?: string;
						p_to?: string;
						p_business_id?: string;
					},
			);
		expect(
			rpcCalls.length,
			"the stats screen did not ask for both windows",
		).toBe(2);

		const currentCall = rpcCalls.find((c) => c.p_from === current.p_from);
		expect(currentCall, "no call asked for the current week").toBeDefined();
		const previousCall = rpcCalls.find((c) => c !== currentCall);
		expect(
			previousCall,
			"no call asked for the comparison window",
		).toBeDefined();
		// The comparison window ENDS where the current one begins, so the
		// growth figure compares adjacent, equal-length stretches.
		expect(
			previousCall?.p_to,
			"the comparison window does not end where the current one begins",
		).toBe(current.p_from);
		expect(
			Date.parse(String(previousCall?.p_from ?? "")) <
				Date.parse(current.p_from),
			"the comparison window is not before the current one",
		).toBe(true);
		// Same business on both — a leaked other-tenant id would be invisible
		// in the rendered numbers but obvious here.
		for (const c of rpcCalls) {
			expect(c.p_business_id).toBe(BUSINESS_ID);
		}
	});

	test("the order KPI counts what the aggregate says, not what the list has", async ({
		page,
	}) => {
		// `ordersCount` comes from the RPC's `orders_count`, NOT from
		// `orders.length`. The catalog stub is deliberately left empty here:
		// if the screen ever derived the KPI from the loaded page instead of
		// the aggregate, it would show 0 with a real revenue on screen.
		await stubSupabase(page, statsWorld());

		await page.goto(`/business/${BUSINESS_ID}/stats`);
		await expect(
			page.getByText(strings.business.ordersCount, { exact: true }),
		).toBeVisible();

		await expect(kpiCard(page, strings.business.ordersCount)).toContainText(
			String(CURRENT_ORDERS),
		);
	});

	test("the average ticket is revenue over order COUNT", async ({ page }) => {
		// The derived figure, and the one most likely to be computed from the
		// wrong denominator. 4000 / 8 = 500. Computing it over `dailyStats`
		// length or over the loaded rows would both land elsewhere while
		// looking equally plausible.
		await stubSupabase(page, statsWorld());

		await page.goto(`/business/${BUSINESS_ID}/stats`);
		await expect(
			page.getByText(strings.business.avgTicket, { exact: true }),
		).toBeVisible();

		// The summary block holds the label and its value side by side.
		await expect(
			page.getByText(strings.business.avgTicket, { exact: true }).locator(".."),
		).toContainText(formatMoney(CURRENT_REVENUE / CURRENT_ORDERS));
	});

	test("the top products come from the aggregate, with their own revenue", async ({
		page,
	}) => {
		// `top_products` is a JSON column projected by the RPC, and the screen
		// renders `sold` and `revenue` per product. A mapper that dropped the
		// embedded array would render an empty section that still looks like
		// "this business sold nothing this week".
		await stubSupabase(page, statsWorld());

		await page.goto(`/business/${BUSINESS_ID}/stats`);
		await expect(
			page.getByText(strings.business.topProducts, { exact: true }),
		).toBeVisible();

		await expect(
			page.getByText("Mystery Box de Panadería", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Pastel de Tarot", { exact: true }),
		).toBeVisible();
		// The per-product revenue, distinct from the headline revenue: 2500
		// and 1500 sum to the KPI, and a mapper that reported gross there
		// would double-count.
		await expect(
			page.getByText(formatMoney(2500), { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(formatMoney(1500), { exact: true }),
		).toBeVisible();
	});

	test("a failed stats query is an error, not an empty dashboard", async ({
		page,
	}) => {
		// "Sin datos de ventas en este período" is a claim about the BUSINESS.
		// Rendering it because the RPC failed tells an owner their week was
		// empty when in fact the app could not ask.
		await stubSupabase(
			page,
			statsWorld({
				rules: [
					{
						method: "POST",
						path: "business_sales_stats",
						status: 400,
						json: {
							code: "PGRST301",
							message: "permission denied for function business_sales_stats",
						},
					},
				],
			}),
		);

		await page.goto(`/business/${BUSINESS_ID}/stats`);

		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText(strings.business.noSalesInPeriod, { exact: true }),
		).toHaveCount(0);
		await expect(page.getByText(/permission denied/i)).toHaveCount(0);
	});

	test("a zero-revenue week is the empty state, honestly labelled", async ({
		page,
	}) => {
		// The counterpart of the test above: the empty branch has to be
		// reachable, or "never show the empty state on error" degenerates
		// into "never show it at all".
		await stubSupabase(
			page,
			statsWorld({
				rules: [
					{
						method: "POST",
						path: "business_sales_stats",
						json: [
							salesStatsRow({
								orders_count: 0,
								revenue: 0,
								top_products: [],
								daily: [],
							}),
						],
					},
				],
			}),
		);

		await page.goto(`/business/${BUSINESS_ID}/stats`);

		await expect(
			page.getByText(strings.business.noSalesInPeriod, { exact: true }),
		).toBeVisible();
		// A successful empty, so no retry: retrying a real zero changes
		// nothing and teaches the owner to distrust the button.
		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toHaveCount(0);
	});
});

test.describe("business payouts: money", () => {
	/**
	 * Four payouts in four different states, chosen so the balance arithmetic
	 * is checkable by hand and breaks if any bucket is wrong:
	 *
	 *   paid       net 85   → paid total 85,  paidCount 1
	 *   pending    net 40   → pending total 40
	 *   processing net 20   → pending total 60
	 *   failed     net 999  → counted NOWHERE (the trap)
	 *
	 * `getPayoutTotals` sums `net_amount` for `paid` into `paid`, and for
	 * `pending`/`processing` into `pending`. A `failed` row is a real trap
	 * here: it carries a large net amount, and any implementation that summed
	 * "everything that is not paid" would report $1,159 pending instead of
	 * $60 — an over-statement of what the platform owes.
	 *
	 * Every row also gets its OWN period, because `periodLabel` is part of
	 * what a row asserts: four rows sharing one period would make a locator
	 * on the period text ambiguous and quietly weaken the check.
	 */
	const PAYOUTS = [
		payoutFixture({ period_start: "2026-09-01", period_end: "2026-09-15" }),
		payoutFixture({
			id: "1a1a1a1a-2b2b-3c3c-4d4d-5e5e5e5e5e5e",
			net_amount: 40,
			platform_fee: 6,
			gross_amount: 46,
			status: "pending",
			period_start: "2026-08-18",
			period_end: "2026-08-31",
			paid_at: null,
			gateway_payout_id: null,
		}),
		payoutFixture({
			id: "2b2b2b2b-3c3c-4d4d-5e5e-6f6f6f6f6f6f",
			net_amount: 20,
			platform_fee: 3,
			gross_amount: 23,
			status: "processing",
			period_start: "2026-08-03",
			period_end: "2026-08-15",
			paid_at: null,
			gateway_payout_id: null,
		}),
		payoutFixture({
			id: "3c3c3c3c-4d4d-5e5e-6f6f-7a7a7a7a7a7a",
			net_amount: 999,
			platform_fee: 1,
			gross_amount: 1000,
			status: "failed",
			period_start: "2026-07-20",
			period_end: "2026-07-31",
			paid_at: null,
			gateway_payout_id: null,
		}),
	];

	const EXPECTED_PAID = 85;
	const EXPECTED_PENDING = 60;

	/**
	 * `periodLabel`'s own output for a payout row, formatted with the app's
	 * month table.
	 *
	 * Derived rather than pasted: a pasted "1 sep – 15 sep, 2026" would be a
	 * copy assertion in disguise, failing this spec whenever the month names
	 * change for reasons that have nothing to do with the payout.
	 */
	function periodLabel(payout: { period_start: string; period_end: string }) {
		const start = new Date(`${payout.period_start}T00:00:00`);
		const end = new Date(`${payout.period_end}T00:00:00`);
		return `${MONTHS_SHORT_ES[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
	}

	/**
	 * The list row for a status.
	 *
	 * `PayoutCard` puts the net amount and the status badge side by side in
	 * `payoutHeader`, and the period line just below it, all inside
	 * `payoutInfo` — so `payoutInfo` is the unit that ties a row's money,
	 * status and period together, which is the claim being made ("this row
	 * says $85, is Pagado, and covers 1–15 sep", not three unrelated facts
	 * that happen to share a screen).
	 *
	 * Three levels up from the badge's TEXT, because `StatusBadge` wraps
	 * its label in its own element and the header is one level above that.
	 */
	function payoutRow(page: Page, status: keyof typeof PAYOUT_STATUS_LABELS) {
		return page
			.getByText(PAYOUT_STATUS_LABELS[status], { exact: true })
			.locator("../../..");
	}

	function payoutsWorld(overrides: Partial<StubOptions> = {}): StubOptions {
		return {
			viewer: "business",
			// Two different reads of the SAME table, told apart by their
			// select list. The totals query asks for `net_amount,status`; the
			// list asks for the full `PAYOUT_FIELDS`. Without this rule the
			// totals would get the list body, whose rows carry every field
			// anyway — so the split would be invisible until the field list
			// changed, which is exactly when it would start mattering.
			rules: [
				{
					method: "GET",
					path: "payouts",
					query: "select=net_amount%2Cstatus",
					json: PAYOUTS.map((p) => ({
						net_amount: p.net_amount,
						status: p.status,
					})),
				},
			],
			bodies: businessBodies({ payouts: PAYOUTS }),
			...overrides,
		};
	}

	test("the balance cards sum net amounts, not gross", async ({ page }) => {
		// 85 = the single PAID payout's NET. Using gross (100) would show a
		// platform fee as money the owner received — the exact error that
		// makes an owner stop trusting the number and call support.
		await stubSupabase(page, payoutsWorld());

		await page.goto(`/business/${BUSINESS_ID}/payouts`);
		await expect(
			page.getByText(strings.business.totalCollected, { exact: true }),
		).toBeVisible();

		const collected = page
			.getByText(strings.business.totalCollected, { exact: true })
			.locator("..");
		await expect(collected).toContainText(formatMoney(EXPECTED_PAID));
		// And explicitly not the gross.
		await expect(collected).not.toContainText(formatMoney(100));
	});

	test("pending + processing are pending, and a FAILED payout is neither", async ({
		page,
	}) => {
		// The trap. There is a $999 failed row in the fixture on purpose: sum
		// "everything that is not paid" and this card reads $1,159, telling
		// the owner the platform owes them a transfer that was rejected.
		await stubSupabase(page, payoutsWorld());

		await page.goto(`/business/${BUSINESS_ID}/payouts`);
		await expect(
			page.getByText(strings.business.pendingProcessing, { exact: true }),
		).toBeVisible();

		const incoming = page
			.getByText(strings.business.pendingProcessing, { exact: true })
			.locator("..");
		await expect(incoming).toContainText(formatMoney(EXPECTED_PENDING));
		await expect(incoming).not.toContainText(formatMoney(999));
		await expect(incoming).not.toContainText(formatMoney(1159));
	});

	test("the balance cards do NOT follow the list filter", async ({ page }) => {
		// The separation the hook exists for, asserted as behaviour.
		//
		// "Completados" returns ONE row to the list. If the cards were derived
		// from the filtered list, "Por procesar" would drop to $0 — right
		// under a list showing a paid transfer, which reads as "you have
		// nothing incoming". Asserting the cards are UNCHANGED after the
		// filter is the only way to catch that.
		await stubSupabase(page, payoutsWorld());

		await page.goto(`/business/${BUSINESS_ID}/payouts`);
		await expect(
			page.getByText(strings.business.totalCollected, { exact: true }),
		).toBeVisible();
		const before = await page
			.getByText(strings.business.pendingProcessing, { exact: true })
			.locator("..")
			.textContent();

		await page
			.getByText(strings.business.payoutsFilterPaid, { exact: true })
			.click();
		// The list is now server-filtered…
		await expect
			.poll(async () => {
				const t = await page
					.getByText(strings.business.pendingProcessing, { exact: true })
					.locator("..")
					.textContent();
				return t;
			})
			.toBe(before);
		// …and the card is untouched.
		await expect(
			page
				.getByText(strings.business.pendingProcessing, { exact: true })
				.locator(".."),
		).toContainText(formatMoney(EXPECTED_PENDING));
	});

	test("each payout row is self-consistent: its own net, status and period", async ({
		page,
	}) => {
		// The list reads the same rows the cards aggregate, so a card that
		// says $85 must be traceable to a row that says $85. Scoping each
		// row by its own status badge is what makes the pairing a claim:
		// without it, "an $85 exists" and "a Pagado exists" are two
		// independent facts that happen to be on the same screen.
		await stubSupabase(page, payoutsWorld());

		await page.goto(`/business/${BUSINESS_ID}/payouts`);
		await expect(
			page.getByText(strings.business.totalCollected, { exact: true }),
		).toBeVisible();

		for (const payout of PAYOUTS) {
			const status = payout.status as keyof typeof PAYOUT_STATUS_LABELS;
			const row = payoutRow(page, status);
			// The NET, per row — the owner is paid the net, so the platform
			// fee must not be in the list.
			await expect(row).toContainText(formatMoney(payout.net_amount));
			await expect(row).not.toContainText(formatMoney(payout.gross_amount));
			// And the period is the ROW's own window, not today's date and
			// not the payment date. A row showing the wrong period looks
			// entirely plausible and is wrong about WHEN the money covers.
			await expect(row).toContainText(periodLabel(payout));
		}
	});

	test("the four statuses are all represented, from four distinct rows", async ({
		page,
	}) => {
		// The count is the assertion that discriminates: a mapper that
		// collapsed `processing` into `pending` would still render two
		// badges, just not four.
		await stubSupabase(page, payoutsWorld());

		await page.goto(`/business/${BUSINESS_ID}/payouts`);
		await expect(
			page.getByText(strings.business.totalCollected, { exact: true }),
		).toBeVisible();

		for (const status of ["paid", "pending", "processing", "failed"] as const) {
			await expect(
				page.getByText(PAYOUT_STATUS_LABELS[status], { exact: true }),
			).toBeVisible();
		}
	});

	test("no movements is the honest empty for a business with no payouts", async ({
		page,
	}) => {
		await stubSupabase(
			page,
			payoutsWorld({
				rules: [
					{
						method: "GET",
						path: "payouts",
						query: "select=net_amount%2Cstatus",
						json: [],
					},
				],
				bodies: businessBodies({ payouts: [] }),
			}),
		);

		await page.goto(`/business/${BUSINESS_ID}/payouts`);

		await expect(
			page.getByText(strings.business.noPayouts, { exact: true }),
		).toBeVisible();
		// A real zero, formatted by the app's own formatter, not a dash.
		await expect(page.getByText(formatMoney(0), { exact: true })).toHaveCount(
			2,
		);
	});

	test("a failed totals read is an error, not a zero balance", async ({
		page,
	}) => {
		// A $0 balance on a screen that could not load is the most expensive
		// kind of wrong: it reads as "you have nothing", and the owner
		// concludes their money is gone. The two balance cards must be
		// reachable only from a real answer.
		//
		// The LIST still answers normally here, so the screen has real
		// transfers to show — which is exactly the trap: an owner looking at
		// "Total cobrado $0" directly above their own $85 transfer.
		//
		// This test is why `payouts.tsx` reads the totals query's own
		// `isLoading`/`isError`. It did not, and `totals?.paid ?? 0` rendered
		// the fabricated zero both during the load and after the failure.
		await stubSupabase(
			page,
			payoutsWorld({
				rules: [
					{
						method: "GET",
						path: "payouts",
						query: "select=net_amount%2Cstatus",
						status: 400,
						json: { code: "42501", message: "permission denied" },
					},
				],
			}),
		);

		await page.goto(`/business/${BUSINESS_ID}/payouts`);

		await expect(
			page.getByText(strings.common.retry, { exact: true }),
		).toBeVisible();
		// Not one zero balance, and not the "no movements" empty state —
		// there ARE movements; the app just could not total them.
		await expect(page.getByText(formatMoney(0), { exact: true })).toHaveCount(
			0,
		);
		await expect(
			page.getByText(strings.business.noPayouts, { exact: true }),
		).toHaveCount(0);
		await expect(page.getByText(/permission denied/i)).toHaveCount(0);
	});
});

/**
 * `periodLabel`'s own output for the fixture's first payout, formatted with
 * the app's own month table.
 *
 * Pasting "1 sep – 15 sep, 2026" would be a copy assertion in disguise: a
 * copy change to the month names would fail this spec for a reason that has
 * nothing to do with the payout. Deriving it from `MONTHS_SHORT_ES` keeps the
 * assertion about the DATA — that the period on screen is the row's period.
 */
