/**
 * Every payload the admin e2e serves, in ONE place, because the admin talks to
 * the API across two boundaries that `page.route()` cannot see both of.
 *
 * ─── Why one module and not two ─────────────────────────────────────────────
 *
 * Measured, on a running app:
 *
 *   - `POST /auth/login` is issued by the Vite SERVER (it is a `createServerFn`).
 *   - `GET /businesses`, `GET /orders/admin` and `GET /auth/me` ARE browser
 *     requests, because those routes have no loader and let the component's
 *     query run.
 *
 * So the same URL can be fetched by the browser on one route and by the server
 * on another. When the fixture for a payload lived only in the `page.route()`
 * handler, the affected page fell through to the stub server's 404 and the error
 * boundary blanked it — a failure that looked like an app bug and was actually a
 * stub bug. `/payouts` and `/categories/admin` were the last two in that
 * category, and their `loader`s are now removed, so this table is consumed by
 * the browser stub for every list route in the panel.
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

/**
 * The sentinel filter that makes `stub-api.ts` answer 500, scoped per path.
 *
 * ─── Why a sentinel and not an arm/disarm switch ─────────────────────────────
 *
 * The failure that used to blank the panel happened in the VITE SERVER process
 * during SSR, and `page.route()` cannot see that request. So the failure has to
 * be injected on the server boundary — but that server is shared by every
 * worker, and a global "fail /payouts" flag flipped by one spec would blank the
 * panel inside whichever unrelated spec happened to be running at that moment.
 *
 * A sentinel in a real filter avoids that entirely and is more honest besides:
 * it is not a special test channel bolted onto the API, it is a value the
 * production contract already accepts. `business_id` on `/payouts` is a
 * declared `UuidSchema.optional()` and `search` on `/categories/admin` is a
 * declared `z.string()`, so both survive the route's `validateSearch` — which
 * matters twice over, because zod STRIPS unknown keys (a `?__fail=1` param
 * would have been deleted before it reached the URL the loader builds) and
 * because the uuid has to be a REAL uuid or `UuidSchema` rejects the navigation
 * and the test never reaches the section at all.
 *
 * The uuid is the kind that cannot collide with real data, so a leaked filter
 * is visible rather than plausible.
 */
export const PAYOUTS_FAILURE_FILTER = "88888888-8888-4888-8888-888888888888";
export const CATEGORIES_FAILURE_FILTER = "e2e-server-side-failure";

/**
 * Whether this request is one of the deliberate outages, and on which param.
 *
 * ─── Why BOTH halves of the stub consult this ───────────────────────────────
 *
 * A panel query can be issued by the Vite server (auth server functions, and any
 * route `loader` that gets added back) or by the browser (every plain component
 * query). The first draft of the failure sentinel only taught the SERVER half,
 * and the measurement caught it immediately: navigating to
 * `/categorias?search=<sentinel>` produced a 200, because the browser's request
 * was fulfilled by `page.route()` from the success table and never reached the
 * stub server at all.
 *
 * That is not a corner case, it is the normal case — it is what the loader
 * removal moved these routes onto. A sentinel that only fires on one boundary
 * would make these tests pass or fail depending on which side happens to fetch,
 * which is precisely the ambiguity being eliminated. One predicate, consulted by
 * both, means "this filter means the API is down" is true of the API and not of
 * the plumbing.
 */
export function failureSentinelFor(
	path: string,
	params: URLSearchParams,
): { param: string; value: string } | undefined {
	if (path === "/payouts" && params.get("business_id") === PAYOUTS_FAILURE_FILTER) {
		return { param: "business_id", value: PAYOUTS_FAILURE_FILTER };
	}
	if (
		path === "/categories/admin" &&
		params.get("search") === CATEGORIES_FAILURE_FILTER
	) {
		return { param: "search", value: CATEGORIES_FAILURE_FILTER };
	}
	return undefined;
}

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
const LOCATION_ID = "44444444-4444-4444-8444-444444444444";
const TEMPLATE_ID = "55555555-5555-4555-8555-555555555555";

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
 * `OfferWithBusinessSchema`. Three embeds, not one: the table's `Negocio` cell
 * reads `row.original.business.name` and the deactivate confirmation renders
 * the same field, so an offer fixture without the embed crashes the CELL — which
 * takes the whole row, and the row is the only thing that proves the table
 * rendered anything.
 */
const OFFER = {
	id: OFFER_ID,
	business_id: ID,
	business_location_id: LOCATION_ID,
	title: "Bolsa de pan E2E",
	description: "Seis panes de masa madre",
	image: null,
	category_ids: [ID],
	original_price: 12,
	discounted_price: 4.5,
	discount_percentage: 62,
	stock: 7,
	initial_stock: 20,
	// Far in the future on purpose: `PickupWindowCell` compares `pickup_end`
	// against `Date.now()` and paints a CLOSED window in `text-destructive`, so a
	// window in the past would make this fixture's meaning depend on the day the
	// suite runs.
	pickup_start: "2099-01-02T18:00:00.000Z",
	pickup_end: "2099-01-02T20:00:00.000Z",
	is_active: true,
	includes: null,
	allergens: "Gluten",
	rating: 4.5,
	review_count: 12,
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
	categories: [{ id: ID, name: "Panadería", slug: "panaderia" }],
	business: {
		id: ID,
		name: "Panadería E2E",
		slug: "panaderia-e2e",
		image: null,
		rating: 4.5,
	},
	location: {
		id: LOCATION_ID,
		name: "Sucursal Centro",
		address: "Av. Siempre Viva 742",
		latitude: -0.1807,
		longitude: -78.4678,
		zone: "Iñaquito",
	},
	distance_km: null,
};

/** `CouponListItemSchema`: `CouponSchema` plus the owning business name. */
const COUPON = {
	id: ID,
	business_id: null,
	code: "E2E-VERDE",
	name: "Verde de prueba",
	type: "percentage",
	value: 15,
	min_order_amount: null,
	max_uses: 100,
	used_count: 4,
	is_active: true,
	expires_at: "2099-01-01T00:00:00.000Z",
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
	// `null`, not a name: a GLOBAL coupon has no business, and that is the
	// distinction the `Todos/Globales/Por negocio` filter exists to draw.
	business_name: null,
};

/**
 * `CommissionSchema`. `has_pending_payouts: true` is load bearing: the table
 * disables the rate input for exactly that flag, so a fixture with it false
 * would let a test click an input the operator cannot actually change.
 */
const COMMISSION = {
	id: ID,
	name: "Panadería E2E",
	slug: "panaderia-e2e",
	commission_rate: 0.15,
	active: true,
	has_pending_payouts: true,
	updated_at: "2026-01-16T00:00:00.000Z",
};

/** `TipSchema`: the whole resource is `{ content, active }` plus audit. */
const TIP = {
	id: ID,
	content: "Guarda tu pan en una bolsa de tela para que respire.",
	active: true,
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: null,
	deleted_at: null,
};

/** `AppConfigSchema`. `key` is the identity here: the table is a key/value grid. */
const APP_CONFIG = {
	key: "support.email",
	value: "ayuda@role.test",
	value_type: "email",
	category: "contacto",
	label: "Correo de soporte",
	description: "Buzón publicado en la landing",
	is_public: true,
	active: true,
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
};

/**
 * `SlideSchema`. `type: "tip"` avoids the `coupon` refinement (which demands a
 * `coupon_code`) so the fixture stays a plain `SlideBase`; `image_url` is null
 * because the schema demands a real URL when present.
 */
const SLIDE = {
	id: ID,
	title: "Slide de bienvenida E2E",
	caption: "Rescata tu primera bolsa hoy",
	badge_text: "Nuevo",
	cta_label: "Explorar",
	redirect_url: "/explore",
	coupon_code: null,
	image_url: null,
	text_color: null,
	button_color: null,
	type: "tip",
	priority: 3,
	active: true,
	start_at: null,
	end_at: null,
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: null,
	deleted_at: null,
};

/**
 * `ReviewModerationItemSchema`. A VISIBLE row (`is_hidden: false`) is the
 * discriminating choice: the inbox's own filter separates `hidden` from
 * `visible`, so a fixture stuck in one state could never tell a working filter
 * from a broken one.
 */
const REVIEW = {
	id: ID,
	user_id: OWNER_ID,
	business_id: ID,
	order_id: OFFER_ID,
	rating: 4,
	comment: "El pan estaba buenísimo, lo recogí puntual.",
	product_rating: 5,
	business_rating: 4,
	created_at: "2026-01-05T00:00:00.000Z",
	updated_at: "2026-01-05T00:00:00.000Z",
	is_hidden: false,
	moderated_at: null,
	moderated_by: null,
	moderated_by_name: null,
	moderation_reason: null,
	hidden_reason: null,
	author_name: "Ana Resiñera",
	business_name: "Panadería E2E",
};

/** `ContactMessageListItemSchema`. `readable: true` because every field is set. */
const CONTACT_MESSAGE = {
	id: ID,
	// `PENDIENTE` is the delivery-of-the-NOTICE status, not "unread". The inbox
	// prints a legend saying exactly that, so the fixture uses the state the
	// legend warns about and the column label can be asserted against it.
	status: "PENDIENTE",
	created_at: "2026-01-06T00:00:00.000Z",
	updated_at: "2026-01-06T00:00:00.000Z",
	readable: true,
	name: "Carla Contacto",
	email: "carla@e2e.test",
	role: "persona",
	city: "Quito",
	excerpt: "Quisiera abrir una panadería en mi barrio.",
};

/** `EmailTemplateDtoSchema`, narrowed to the fields the templates tab reads. */
const EMAIL_TEMPLATE = {
	id: TEMPLATE_ID,
	name: "Bienvenida E2E",
	description: "Plantilla de prueba",
	subject: "Bienvenido a Rolé",
	body_html: "<p>Hola</p>",
	header_id: null,
	footer_id: null,
	variables: ["nombre"],
	is_active: true,
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
	deleted_at: null,
};

/**
 * `PushTemplateDtoSchema`. Needed by `/campanas/push`, which blocks its whole
 * render on `usePushTemplates()`: `if (list.isLoading || templates.isLoading)`.
 * A page stuck on a skeleton because its SECOND query was unstubbed looks
 * exactly like a page stuck because of the list, and the anti-vacuity guard
 * would then have caught the wrong failure.
 */
const PUSH_TEMPLATE = {
	id: TEMPLATE_ID,
	name: "Bienvenida push E2E",
	title: "Bienvenido a Rolé",
	body: "Tenemos una bolsa esperándote.",
	data: {},
	is_active: true,
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
	deleted_at: null,
};

/** `EmailComponentDtoSchema`. */
const EMAIL_COMPONENT = {
	id: ID,
	name: "Pie E2E",
	description: "Componente de prueba",
	type: "footer",
	html_content: "<footer>Rolé</footer>",
	is_active: true,
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
	deleted_at: null,
};

/**
 * `SegmentDtoSchema`. `estimated_count` is a NUMBER here and the card renders
 * `~{count} destinatarios`, so the fixture carries one: a `null` would render
 * the literal `~?` and the assertion could not tell a real count from a
 * fallback.
 */
const SEGMENT = {
	id: ID,
	name: "Personas de Quito",
	description: "Segmento de prueba",
	type: "dynamic",
	filters: { and: [{ field: "city", op: "eq", value: "Quito" }] },
	is_active: true,
	estimated_count: 42,
	category: "announcements",
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: "2026-01-01T00:00:00.000Z",
	deleted_at: null,
};

/**
 * `CampaignDtoSchema`, parameterised by channel: the push and the mail campaign
 * lists are the SAME endpoint distinguished by `?channel=`, and the two pages
 * are different products. One fixture for both would make the channel filter
 * untestable.
 */
function campaign(channel: "email" | "push") {
	return {
		id: channel === "push" ? OFFER_ID : TEMPLATE_ID,
		name: `Campaña ${channel} E2E`,
		channel,
		template_id: TEMPLATE_ID,
		category: "promotions",
		segment_ids: [ID],
		include_user_ids: [],
		exclude_user_ids: [],
		scheduled_at: null,
		status: "draft",
		sent_at: null,
		total_recipients: 0,
		total_sent: 0,
		total_failed: 0,
		total_delivered: 0,
		total_opened: 0,
		total_clicked: 0,
		total_bounced: 0,
		created_at: "2026-01-02T00:00:00.000Z",
		updated_at: "2026-01-02T00:00:00.000Z",
		deleted_at: null,
	};
}

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
		// ─── The twelve sections that had no browser coverage ──────────────────
		// Paths are the API's, not the route's: `/campanas/mails` reads
		// `/email-marketing/campaigns?channel=email`, and getting that mapping
		// wrong is precisely the kind of mistake this table is here to prevent.
		case path === "/offers":
			return paginated([OFFER]);
		case path === "/coupons":
			return paginated([COUPON]);
		case path === "/commissions":
			return paginated([COMMISSION]);
		case path === "/tips/admin":
			return paginated([TIP]);
		case path === "/app-config":
			return paginated([APP_CONFIG]);
		case path === "/slides/admin":
			return paginated([SLIDE]);
		case path === "/contact-inbox":
			return paginated([CONTACT_MESSAGE]);
		case path === "/reviews/moderation":
			// The one fixture endpoint that FILTERS, because `visibility` is a
			// server-side filter the panel's own test depends on. Measured against
			// the real endpoint (`reviews.repository.ts:231`): `hidden` selects
			// `is_hidden`, `visible` selects the complement, `all` selects both.
			// A table that ignored the param would answer the same row to every
			// visibility, and a test asserting "the filter empties the table" would
			// then be testing the STUB rather than the panel.
			return paginated(
				params.get("visibility") === "hidden" ? [] : [REVIEW],
			);
		case path === "/email-marketing/templates":
			return paginated([EMAIL_TEMPLATE]);
		case path === "/push-notifications/templates":
			return paginated([PUSH_TEMPLATE]);
		case path === "/email-marketing/components":
			return paginated([EMAIL_COMPONENT]);
		case path === "/email-marketing/segments":
			return paginated([SEGMENT]);
		case path === "/email-marketing/campaigns":
			// One endpoint, two products. The `channel` parameter is the only
			// thing separating the push list from the mail list, so answering
			// both with the same row would make that filter untestable.
			return paginated([
				campaign(params.get("channel") === "push" ? "push" : "email"),
			]);
		default:
			return undefined;
	}
}
