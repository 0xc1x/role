/**
 * Every payload the admin e2e serves, in ONE place, because the admin talks to
 * the API across two boundaries that `page.route()` cannot see both of.
 *
 * ─── Why one module and not two ─────────────────────────────────────────────
 *
 * Measured, on a running app:
 *
 *   - `POST /auth/login` is issued by the Vite SERVER (it is a `createServerFn`).
 *   - `GET /payouts` and `GET /categories/admin` are issued by the Vite SERVER
 *     too: `_layout.pagos.tsx` and `_layout.categorias.tsx` declare a route
 *     `loader`, and route loaders run during SSR. A `page.route()` handler
 *     installed for the whole API surface never sees either request.
 *   - `GET /businesses`, `GET /orders/admin` and `GET /auth/me` ARE browser
 *     requests, because `_layout.negocios.tsx` and `_layout.ordenes.tsx` have no
 *     loader and let the component's query run.
 *
 * So the same URL can be fetched by the browser on one route and by the server
 * on another. When the fixture for a payload lived only in the `page.route()`
 * handler, `/pagos` and `/categorias` fell through to the stub server's 404 and
 * the error boundary blanked both pages — a failure that looked like an app bug
 * and was actually a stub bug.
 *
 * One module, imported by both `stub-api.ts` (the HTTP boundary) and
 * `support/admin.ts` (the `page.route` boundary), makes it impossible for the
 * two to disagree. That is the whole point: a suite whose two halves describe
 * different APIs is a suite that tests a program nobody runs.
 *
 * ─── Why the payloads are this detailed ─────────────────────────────────────
 *
 * The app does NOT validate list responses — `api.get<T>` is an unchecked cast —
 * so an under-specified body does not produce a validation error. It produces a
 * blank cell, a `Cannot read properties of undefined` inside a table cell, or an
 * error boundary that takes the whole page down. Both happened while writing
 * this file: `orders` crashed on `business_id.slice(0, 8)` and the dashboard
 * crashed on `accrued.gross_amount`. Every object below is the documented
 * `commons` shape, field for field.
 */

/** `PaginatedData<T>` from `commons`: `{ data, meta }`, never a bare array. */
function paginated<T>(data: T[], total = data.length) {
	return {
		data,
		meta: {
			page: 1,
			limit: 10,
			total,
			total_pages: Math.max(1, Math.ceil(total / 10)),
		},
	};
}

/** Values that cannot collide with a real uuid, so a fixture leak is obvious. */
const ID = "99999999-9999-4999-8999-999999999999";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const OFFER_ID = "33333333-3333-4333-8333-333333333333";

export const ADMIN_EMAIL = "admin@role.test";
export const ADMIN_PASSWORD = "correct-horse-battery";

/** The one account the auth endpoints accept. Mirrors `KNOWN_ADMIN` in the stub. */
export const ADMIN_USER = {
	id: "11111111-1111-4111-8111-111111111111",
	email: ADMIN_EMAIL,
	full_name: "Ada Admin",
	avatar_url: null,
	role: "admin" as const,
};

/** `BusinessSchema`. */
const BUSINESS = {
	id: ID,
	owner_id: OWNER_ID,
	name: "Panadería E2E",
	type: "restaurant",
	slug: "panaderia-e2e",
	image: null,
	cover_image: null,
	rating: 4.5,
	review_count: 12,
	description: "Negocio fixture del e2e",
	phone: "+34600000000",
	email: "panaderia@e2e.test",
	website: null,
	commission_rate: 0.15,
	balance: 120.5,
	is_active: true,
	verification_status: "approved",
	verified_at: "2026-01-01T00:00:00.000Z",
	verified_by: null,
	rejection_reason: null,
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
};

/**
 * `AdminOrderListItemSchema`. `business_name` and `business_id` are both
 * required even though the cell prefers the name: the fallback is
 * `row.original.business_name ?? row.original.business_id.slice(0, 8)`, and a
 * fixture carrying neither crashes the cell rather than rendering a dash.
 */
const ORDER = {
	id: ID,
	order_number: "RLE-0001",
	status: "confirmed",
	business_id: ID,
	business_name: "Panadería E2E",
	offer_id: OFFER_ID,
	offer_title: "Bolsa de pan",
	price: 4.5,
	original_price: 10,
	pickup_start: "2026-01-02T18:00:00.000Z",
	pickup_end: "2026-01-02T20:00:00.000Z",
	is_stuck: false,
	created_at: "2026-01-02T10:00:00.000Z",
	updated_at: "2026-01-02T10:00:00.000Z",
};

/** `PayoutSchema`. */
const PAYOUT = {
	id: ID,
	business_id: ID,
	business_name: "Panadería E2E",
	period_start: "2026-01-01",
	period_end: "2026-01-15",
	gross_amount: 300,
	platform_fee: 45,
	net_amount: 255,
	status: "pending",
	gateway_payout_id: null,
	paid_at: null,
	created_at: "2026-01-16T00:00:00.000Z",
	updated_at: "2026-01-16T00:00:00.000Z",
};

const CATEGORY = {
	id: ID,
	name: "Panadería",
	description: "Categoría fixture",
	slug: "panaderia",
	image_url: null,
	active: true,
};

/** `PlatformStatsSchema`: three non-negative integers, no more. */
const PLATFORM_STATS = { users: 128, businesses: 7, meals_saved: 431 };

/**
 * `RevenueStatsSchema`. The `accrued`/`collected` split is three levels deep and
 * is the entire reason this report exists; a flattened guess throws inside
 * `AccruedBlock` and the error boundary replaces the dashboard with nothing.
 */
function revenueStats(from: string | null, to: string | null) {
	return {
		period: { from: from ?? "2026-01-01", to: to ?? "2026-01-31" },
		accrued: {
			gross_amount: 1234.5,
			platform_fees: 185.2,
			business_net: 1049.3,
			effective_commission_rate: 0.15,
			orders: { total: 274, completed: 260, cancelled: 9, expired: 5 },
		},
		collected: {
			gross_amount: 900,
			platform_fees: 135,
			business_net: 765,
			paid_payouts: 3,
			outstanding_payouts: 1,
			outstanding_business_net: 120,
			failed_payouts: 0,
		},
	};
}

/**
 * The single answer table. Returns `undefined` for anything unknown, and both
 * boundaries treat `undefined` as "refuse loudly" — the HTTP stub answers 404
 * and the `page.route` handler continues to the network, which also 404s. A
 * spec that forgets to stub something fails with a visible error instead of
 * passing against a plausible default.
 *
 * Paths are the API's, without the `/api/v1` prefix both callers strip.
 */
export function respondTo(
	path: string,
	params: URLSearchParams = new URLSearchParams(),
): unknown {
	switch (true) {
		case path === "/auth/me":
			return { user: ADMIN_USER };
		case path === "/businesses":
			return paginated([BUSINESS]);
		case path === "/orders/admin":
			return paginated([ORDER]);
		case path === "/payouts":
			return paginated([PAYOUT]);
		case path === "/categories/admin":
			return paginated([CATEGORY]);
		case path === "/stats/platform":
			return PLATFORM_STATS;
		case path === "/stats/revenue":
			return revenueStats(params.get("from"), params.get("to"));
		case path === "/email-marketing/sends":
			return paginated([]);
		default:
			return undefined;
	}
}
