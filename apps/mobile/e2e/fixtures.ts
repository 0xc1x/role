import { test as base, expect, type Page } from "@playwright/test";
import { strings } from "../src/core/i18n/strings";
import { onboardingSeenKey } from "../src/features/onboarding/domain/onboarding";

/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * Two rules from the mobile AGENTS.md decide everything below.
 *
 * 1. The app validates `EXPO_PUBLIC_*` with Zod at startup
 *    (`src/core/config/env.ts`). There is no "degraded" boot: a missing key
 *    throws before the first render. So the env is not a convenience here, it
 *    is the difference between a suite that tests the app and a suite that
 *    times out on every locator.
 *
 * 2. Screens carry no inline literals — every user-facing string is a key in
 *    `src/core/i18n/strings.ts`. A selector that hardcodes "Últimas Horas"
 *    does not fail when the product breaks; it fails the week someone renames
 *    a section, and the person reading that red test learns nothing about the
 *    product. So every text assertion in this suite reads its copy out of the
 *    catalog. The catalog is not a translation table here, it is the contract.
 *
 * ─── Why the network is stubbed at the browser edge ─────────────────────────
 *
 * Per ADR-0002 the mobile app talks to Supabase directly — RLS is the data
 * boundary, and `apps/api` is a BFF for admin and landing only. So the thing
 * to stub is PostgREST, not the NestJS API. Two reasons this belongs in the
 * browser e2e and not in a mocked repository test:
 *
 * - The backend already has its own end-to-end suite (44 tests, including a
 *   real login over HTTP). Re-proving that the policies work from here would
 *   test the database twice and the app zero times.
 * - The failures worth catching in an app e2e are the app's: does a rejected
 *   RPC become the error state, does a deep link survive a reload, does a
 *   guest get bounced. All three live between the fetch and the DOM, and a
 *   repository mock would sit below exactly that boundary.
 */

/** The Supabase project the app is built against. Must match the webServer env. */
export const SUPABASE_URL = "https://test.supabase.co";

/** A stable, syntactically valid UUID: PostgREST filters compare it as text. */
export const TEST_USER_ID = "11111111-2222-3333-4444-555555555555";

/**
 * AsyncStorage on web is a thin wrapper over `localStorage`, and the
 * onboarding "already seen" flag is a PER-VIEWER key: a guest and each
 * account mark it separately, so a fresh login does not inherit the flag the
 * guest set. That is why `onboardingSeenKey` is imported from the app instead
 * of being retyped here — a pasted literal seeded `:guest` for a signed-in
 * consumer, the app looked up `:user-id`, found nothing, and parked an
 * authenticated user on the first-run pager. A literal would have turned that
 * into a mystery timeout instead of a one-line diff.
 */
const VIEWER_IDS = {
	guest: null,
	consumer: TEST_USER_ID,
} as const;

/** A viewer whose onboarding flag is already set, by id. */
export type ViewerId = keyof typeof VIEWER_IDS;

/** The session key supabase-js derives from the project URL. Derivation: `sb-<first label of the hostname>-auth-token`. */
const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;

/**
 * A `profiles` row in the shape `authRepository.fetchProfile` selects. The
 * column list is copied from the repository so that a future column addition
 * that the app starts reading shows up here as a missing field rather than
 * as a silently different screen.
 */
export function profileRow(overrides: Record<string, unknown> = {}) {
	return {
		id: TEST_USER_ID,
		email: "consumer@role.test",
		full_name: "Consumidora de Prueba",
		avatar_url: null,
		phone: null,
		city: "Ciudad de México",
		role: "user",
		...overrides,
	};
}

/** A Supabase session in the shape `supabase.auth.getSession` reads back. */
export function sessionEnvelope(overrides: Record<string, unknown> = {}) {
	return {
		access_token: "e2e-access-token",
		refresh_token: "e2e-refresh-token",
		token_type: "bearer",
		expires_in: 3600,
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		user: {
			id: TEST_USER_ID,
			aud: "authenticated",
			role: "authenticated",
			email: "consumer@role.test",
			email_confirmed_at: new Date().toISOString(),
			user_metadata: {
				full_name: "Consumidora de Prueba",
				role: "user",
				analytics_consent_granted: false,
			},
			app_metadata: { provider: "email", providers: ["email"] },
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
		},
		...overrides,
	};
}

export type SupabaseFailure = {
	/** PostgREST error code, mapped by `toAppError` into the app taxonomy. */
	code: string;
	message: string;
	details?: string;
	hint?: string;
};

/**
 * Records every Supabase request a spec caused, so a test can assert what the
 * app ASKED for and not only what it rendered. Two of the flows below are
 * about the request, not the DOM: the auth gate must not even try to read
 * another viewer's orders, and a 500 must be retried rather than swallowed.
 */
export type SupabaseLog = {
	/** e.g. `POST /rest/v1/rpc/active_offers_near` */
	route: string;
	body: unknown;
};

export type SupabaseStubs = {
	/** Every Supabase request the app made, in order. */
	calls: SupabaseLog[];
	/** Requests matching a method+path prefix, for narrower assertions. */
	callsTo: (method: string, pathPrefix: string) => SupabaseLog[];
	/**
	 * Make a failing endpoint start answering normally, as a flaky network
	 * coming back.
	 *
	 * The alternative — registering a second route handler after the click —
	 * races the click and changes what is under test, so a "the retry button
	 * works" test quietly becomes a "a second route handler exists" test.
	 * Flipping the existing stub keeps the single-handler invariant and makes
	 * the click the only thing that changes.
	 */
	recover: (endpoint: string) => void;
};

export type StubOptions = {
	/**
	 * PostgREST RPC and table names that must FAIL, keyed by the last path
	 * segment. Everything else answers with `defaultBody`.
	 *
	 * Failing by name rather than by "fail everything" is deliberate: a total
	 * black hole also breaks the config prefetch and the splash, so the spec
	 * would be measuring the 6-second splash timeout instead of the error
	 * state it claims to test.
	 */
	fail?: Record<string, SupabaseFailure>;
	/**
	 * How many times each named failure fires before that endpoint starts
	 * answering. Omitted means "always".
	 *
	 * This is what makes a retry testable: the first request fails, the user
	 * presses the app's own retry button, and the second request gets a real
	 * answer. Asserting the recovery needs the network to actually recover, and
	 * re-registering the route mid-test is not a way to model that — it races
	 * the click and quietly changes what is under test.
	 */
	failTimes?: number;
	/** Per-endpoint success bodies, keyed by the last path segment. */
	bodies?: Record<string, unknown>;
	/** Body for any call not named in `fail` or `bodies`. Defaults to `[]`. */
	defaultBody?: unknown;
	/**
	 * The viewer this spec acts as. `guest` has no session and no onboarding
	 * flag; `consumer` has both.
	 *
	 * Deriving both from one name is the point: the onboarding flag is keyed
	 * by viewer id, so a spec that seeds a session but a `:guest` onboarding
	 * flag gets an authenticated user stuck on the first-run pager — a real
	 * bug in the spec that looks exactly like a boot regression.
	 */
	viewer?: ViewerId;
	/** Force the first-visit state (no onboarding flag) for a given viewer. */
	firstVisit?: boolean;
	/** Profile row returned by `fetchProfile` when the viewer is signed in. */
	profile?: Record<string, unknown>;
	/**
	 * Make `POST /auth/v1/token` fail, the way GoTrue refuses bad credentials.
	 *
	 * The `message` is the real driver string on purpose: `mapAuthError` matches
	 * on it by pattern, so a spec that used a sanitised message would pass
	 * against a mapper that no longer translates anything.
	 */
	authFailure?: { status?: number } & Record<string, unknown>;
};

/**
 * Installs the whole network boundary for a spec.
 *
 * The catch-all is deliberately last and deliberately total: any Supabase
 * request the app makes that this helper does not model still gets a
 * deterministic answer, so a new query cannot turn the suite red for the
 * wrong reason. Assertions about behaviour belong in the spec, not in an
 * unhandled-request failure.
 */
export async function stubSupabase(
	page: Page,
	options: StubOptions = {},
): Promise<SupabaseStubs> {
	const calls: SupabaseLog[] = [];
	const fail = options.fail ?? {};
	const bodies = options.bodies ?? {};
	const defaultBody = options.defaultBody ?? [];
	// Per-endpoint failure budget. Counting per endpoint (not globally) is what
	// lets a spec say "the first offer query fails" while the other sections,
	// which fire their queries at the same time, are unaffected.
	const remainingFailures = new Map<string, number>(
		Object.keys(fail).map((key) => [key, options.failTimes ?? Infinity]),
	);
	const profile = options.profile ?? profileRow();
	const viewer: ViewerId = options.viewer ?? "guest";
	const viewerId = VIEWER_IDS[viewer];
	// A signed-in viewer carries a session; the session's own id is the one
	// the app will resolve the profile to, so the onboarding flag has to be
	// keyed by that same id.
	const session =
		viewerId === null
			? null
			: sessionEnvelope({
					user: {
						...sessionEnvelope().user,
						id: viewerId,
					},
				});

	await page.route(`${SUPABASE_URL}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		const method = request.method();
		const route_ = `${method} ${url.pathname}`;
		let body: unknown = null;
		try {
			body = request.postDataJSON();
		} catch {
			body = request.postData();
		}
		calls.push({ route: route_, body });

		const json = (payload: unknown, status = 200) =>
			route.fulfill({
				status,
				contentType: "application/json; charset=utf-8",
				body: JSON.stringify(payload),
			});

		// ── Auth ────────────────────────────────────────────────────────────
		if (url.pathname === "/auth/v1/token") {
			if (options.authFailure) {
				// GoTrue's refusal shape. The status matters: supabase-js decides
				// between "throw an AuthError" and "throw a raw error" partly on
				// it, and a 200 with an error body would not exercise the path the
				// app actually takes.
				return json(
					options.authFailure,
					(options.authFailure.status as number) ?? 400,
				);
			}
			// `signInWithPassword` with valid input. The app's own
			// classification of a bad password is unit-tested; here the only
			// question is what the app DOES with a good session.
			return json(session ?? sessionEnvelope());
		}
		if (url.pathname === "/auth/v1/user") {
			return json(sessionEnvelope().user);
		}
		if (url.pathname === "/auth/v1/logout") {
			return route.fulfill({ status: 204, body: "" });
		}

		// ── The session's own row: `authRepository.fetchProfile` ────────────
		if (url.pathname === "/rest/v1/profiles") {
			return json(profile);
		}
		// Consent lives in `user_consents`, not `profiles`. The repository
		// distinguishes "row absent" (null) from "not granted" (false), and
		// that difference is the whole point of the `??` in its code.
		if (url.pathname === "/rest/v1/user_consents") {
			return json({
				user_id: TEST_USER_ID,
				consent_type: "analytics",
				granted: false,
			});
		}

		// ── Named failures ──────────────────────────────────────────────────
		// Keyed on the last path segment, so `fail: { active_offers_near: … }`
		// covers both the RPC and a hypothetical table of that name.
		const segment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
		const budget = remainingFailures.get(segment) ?? 0;
		const failure = fail[segment];
		if (failure && budget > 0) {
			if (budget !== Infinity) remainingFailures.set(segment, budget - 1);
			// PostgREST error envelope. `toAppError` reads `.code` off this
			// object and maps it; anything else would fall through to the
			// generic `unknown` bucket and the spec would assert the wrong copy.
			return json(
				{
					code: failure.code,
					message: failure.message,
					details: failure.details ?? null,
					hint: failure.hint ?? null,
				},
				400,
			);
		}

		if (segment in bodies) return json(bodies[segment]);

		return json(defaultBody);
	});

	await seedViewerState(page, {
		viewerId,
		session,
		skipOnboardingFlag: options.firstVisit === true,
	});
	return {
		calls,
		callsTo: (method, pathPrefix) =>
			calls.filter((c) => c.route === `${method} ${pathPrefix}`),
		recover: (endpoint: string) => remainingFailures.set(endpoint, 0),
	};
}

/**
 * Puts the browser in a known viewer state before the app boots.
 *
 * `addInitScript` runs before any page script, which matters: the root layout
 * reads the session and the onboarding flag during its first effect, so
 * seeding afterwards would race the boot gate and make the spec flaky for a
 * reason that has nothing to do with what it asserts.
 */
async function seedViewerState(
	page: Page,
	state: {
		viewerId: string | null;
		session: ReturnType<typeof sessionEnvelope> | null;
		skipOnboardingFlag: boolean;
	},
) {
	const storage: Record<string, string> = {};
	if (!state.skipOnboardingFlag) {
		storage[onboardingSeenKey(state.viewerId)] = "true";
	}
	if (state.session) {
		storage[SESSION_KEY] = JSON.stringify(state.session);
	}
	if (Object.keys(storage).length === 0) return;

	await page.addInitScript((entries: Record<string, string>) => {
		for (const [key, value] of Object.entries(entries)) {
			window.localStorage.setItem(key, value);
		}
	}, storage);
}

/**
 * Re-exported rather than extended on purpose.
 *
 * An auto-fixture that installs a default stub for every spec looked tidier,
 * but specs here need different network worlds (empty catalogue, a rejected
 * RPC, a real session) and re-registering the route inside a spec silently
 * shadows the fixture's handler. Making `stubSupabase(page, …)` an explicit
 * first line in every test keeps the network state of each one visible at the
 * top of the test that depends on it, and there is exactly one handler.
 */
export const test = base;
export { expect };

/**
 * One row of `active_offers_near`, in the shape the RPC returns.
 *
 * Mirrors `OFFER_SELECT` (`src/features/offers/data/offer-select.ts`) plus the
 * `distance_km` the RPC projects, because that pair IS the contract between
 * the database function and `mapOfferDetail`. A fixture that left out the
 * embedded `businesses` object would still typecheck and still render a card —
 * just a card with an empty merchant name, which is precisely the class of
 * mapper regression the loaded-offer spec is here to catch.
 */
export function offerFixture(overrides: Record<string, unknown> = {}) {
	return {
		id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		business_id: "99999999-8888-7777-6666-555555555555",
		business_location_id: "12121212-3434-5656-7878-909090909090",
		title: "Mystery Box de Panadería",
		description: "Una selección de panadería del día.",
		image: null,
		original_price: 180,
		discounted_price: 60,
		stock: 8,
		initial_stock: 20,
		pickup_start: "2026-09-28T18:00:00.000Z",
		pickup_end: "2026-09-28T21:00:00.000Z",
		is_active: true,
		includes: "4 piezas",
		allergens: "Gluten",
		rating: 4.5,
		review_count: 12,
		created_at: "2026-09-28T12:00:00.000Z",
		distance_km: 1.2,
		businesses: {
			id: "99999999-8888-7777-6666-555555555555",
			name: "Panadería La Espiga",
			type: "bakery",
			image: null,
			rating: 4.6,
			review_count: 88,
		},
		business_locations: {
			id: "12121212-3434-5656-7878-909090909090",
			name: "Sucursal Roma",
			address: "Av. Álvaro Obregón 220, Roma Norte",
			latitude: 19.4194,
			longitude: -99.1626,
			zone: "Roma Norte",
		},
		offer_categories: [
			{
				categories: {
					id: "44444444-5555-6666-7777-888888888888",
					name: "Panadería",
					slug: "panaderia",
					emoji: "🥐",
					image_url: null,
					active: true,
				},
			},
		],
		...overrides,
	};
}

/**
 * Fills and submits the sign-in form, the way a person does.
 *
 * The fields are found by their catalogue label, which `TextField` forwards to
 * the input's accessible name. The password field has no placeholder at all
 * (it is a `secureToggle`, and the toggle owns that slot), so label-based
 * lookup is the only handle that works for both fields — and a selector keyed
 * on `input[type=password]` or on a CSS class would survive a redesign while
 * quietly ceasing to test the form.
 *
 * `exact: true` is load-bearing on the password field: `getByLabel` substring-
 * matches by default, and the show/hide toggle's accessible name
 * (`strings.auth.showPassword` / `hidePassword`) contains the word "Contraseña",
 * so a substring lookup resolves to two elements and refuses to fill either.
 */
export async function loginAs(page: Page, email: string, password: string) {
	await page.getByLabel(strings.auth.email, { exact: true }).fill(email);
	await page.getByLabel(strings.auth.password, { exact: true }).fill(password);
	await page.getByText(strings.auth.login, { exact: true }).last().click();
}

/**
 * The four consumer destinations, named by the catalog.
 *
 * A tab label is a product decision. Building the selectors out of
 * `strings.home.title` and friends means renaming a tab in the catalogue
 * renames it here; a hardcoded "Pedidos" would fail on a copy change and
 * teach the next reader nothing about the product.
 */
export const CONSUMER_TABS = [
	{ name: strings.home.title, path: "/" },
	{ name: strings.explore.title, path: "/explore" },
	{ name: strings.orders.tabTitle, path: "/orders" },
	{ name: strings.profile.title, path: "/profile" },
] as const;

/**
 * The navigation tab bar, identified by CONTENT rather than by position.
 *
 * `getByRole("tablist").first()` is wrong on this app, and it was wrong in a
 * way that only surfaced on the third tab: the orders screen renders its own
 * segmented control (Activos / Pasados) which also carries `role="tablist"`,
 * and it lands FIRST in the DOM. So `.first()` handed the clicker a two-tab
 * list with no `Perfil` in it, and the spec timed out on a locator that was
 * never going to resolve — on a passing app.
 *
 * Filtering by "the tablist that contains the Home tab" is unambiguous no
 * matter how many segmented controls a screen adds, and it reads as the
 * intention it is: this is the bottom navigation, not any tab strip.
 */
export function consumerTablist(page: Page) {
	return page
		.getByRole("tablist")
		.filter({ has: page.getByRole("tab", { name: strings.home.title }) });
}

/** One destination in the bottom navigation, by its catalog label. */
export function consumerTab(page: Page, name: string) {
	return consumerTablist(page).getByRole("tab", { name });
}

/**
 * Waits until the consumer shell is mounted and interactive.
 *
 * This is the app's own "the first screen is on screen" signal, not a sleep.
 * The root layout holds a splash until fonts, config and the session resolve
 * (with a 6 s anti-stall escape hatch), and the consumer layout returns a
 * `LoadingView` while the auth store is still `loading`; neither is a stable
 * thing to assert against directly, and the tab bar only exists once both
 * have settled.
 */
export async function waitForConsumerShell(page: Page) {
	await expect(consumerTablist(page)).toBeVisible();
}
