import { beforeEach, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as realReact from "react";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom has no declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

/**
 * M23: ocho pantallas devolvían `null` en estados que un usuario alcanza de
 * verdad. En los dos layouts de tabs eso no era un hueco invisible: la layout
 * es la única dueña de la Navbar, así que `null` se leía como pantalla en
 * blanco SIN navegación — y la splash raíz tiene un timeout de 6s, que es
 * justo lo que dispara ese camino cuando la sesión o el storage se cuelgan.
 *
 * El contrato que se fija:
 *   - "todavía no sé"  → LoadingView (LoadingView marker).
 *   - "no existe"       → EmptyState con copy es-ES.
 *   - "no me corresponde" → Redirect (guard de navegación, se mantiene).
 */

const LOADING = "LOADING_VIEW";
const SKELETON = "SKELETON";
const NOT_FOUND = "NOT_FOUND";
const PACKAGE_ROOT = join(import.meta.dir, "..", "..", "..", "..");
const wrapper = ({ children }: { children?: ReactNode }) =>
	createElement(nativeWeb.View, null, children);
const empty = () => null;

// `renderToStaticMarkup` never runs effects, and two of the guards under test
// (`app/index.tsx`, `app/my-business/business-new.tsx`) navigate from one. The
// effects are made synchronous here so the navigation is observable.
mock.module("react", () => ({
	...realReact,
	useEffect: (effect: () => undefined | (() => void)) => {
		effect();
	},
}));

/** Copy de "no existe" por pantalla, para no repetir cadenas en el spec. */
const NOT_FOUND_COPY = [
	strings.businessProfile.notFoundTitle,
	strings.business.locationNotFoundTitle,
	strings.business.couponNotFoundTitle,
	strings.business.payoutNotFoundTitle,
];

let authStatus: "loading" | "authenticated" | "guest" = "loading";
let authProfile: { id: string; role: string } | null = null;
let authInitialized = false;
let onboardingResolved = true;
let onboardingShow = false;
let replaced: string[] = [];

mockNativeUi({
	FlatList: empty,
	ScrollView: wrapper,
	ActivityIndicator: empty,
});

mock.module("expo-router", () => ({
	router: {
		replace: (path: string) => replaced.push(path),
		push: (path: string) => replaced.push(path),
		back: () => {},
		canGoBack: () => false,
	},
	Redirect: (props: { href: string }) =>
		createElement(nativeWeb.Text, null, `REDIRECT:${props.href}`),
	Tabs: (props: { children?: ReactNode }) =>
		createElement(nativeWeb.View, null, props.children),
	Stack: wrapper,
	useSegments: () => ["(consumer)", "index"],
	useLocalSearchParams: () => ({
		id: "b-1",
		locationId: "l-1",
		couponId: "c-1",
		payoutId: "p-1",
	}),
	useRouter: () => ({ replace: (path: string) => replaced.push(path) }),
	useNavigation: () => ({ getState: () => ({ index: 0 }) }),
}));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@rn-primitives/portal", () => ({ PortalHost: empty }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));
mock.module("@/src/core/ui/Navbar", () => ({ default: empty, BAR_HEIGHT: 60 }));
mock.module("@/src/core/ui/tabbar-store", () => ({
	useTabBarStore: () => ({ props: null }),
	setTabBarProps: () => {},
	withSyncedTabIndex: () => null,
}));
mock.module("@/src/features/auth/store", () => ({
	useAuthStore: Object.assign(
		(selector?: (s: unknown) => unknown) => {
			const state = {
				status: authStatus,
				profile: authProfile,
				initialized: authInitialized,
			};
			return selector ? selector(state) : state;
		},
		{ getState: () => ({ profile: authProfile }) },
	),
}));
mock.module("@/src/features/onboarding", () => ({
	useOnboardingState: () => ({
		resolved: onboardingResolved,
		showOnboarding: onboardingShow,
	}),
	onboardingAudience: () => "consumer",
	useMarkOnboardingSeen: () => ({ mutateAsync: () => Promise.resolve() }),
}));

mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	LoadingView: () => createElement(nativeWeb.Text, null, LOADING),
	ErrorState: () => createElement(nativeWeb.Text, null, "ERROR_STATE"),
	EmptyState: (props: { title: string }) =>
		createElement(nativeWeb.Text, null, `${NOT_FOUND}:${props.title}`),
	Screen: wrapper,
	ScreenHeader: () => null,
	goBackOr: () => {},
	StatusBadge: empty,
}));

mock.module("@/components/ui/button", () => ({ Button: empty }));
mock.module("@/components/ui/card", () => ({
	Card: wrapper,
	CardContent: wrapper,
	CardHeader: wrapper,
}));
mock.module("@/components/ui/card-presable", () => ({
	CardPressable: wrapper,
}));
mock.module("@/components/ui/skeleton", () => ({
	Skeleton: () => createElement(nativeWeb.Text, null, "SKELETON"),
}));
mock.module("@/src/features/business/components/BusinessLocationMap", () => ({
	BusinessLocationMap: empty,
}));
mock.module("@/src/features/business/components/LocationForm", () => ({
	LocationForm: empty,
}));
mock.module("@/src/features/business/components/CouponForm", () => ({
	CouponForm: empty,
}));
mock.module("@/src/features/business/components/BusinessForm", () => ({
	BusinessForm: empty,
}));
mock.module("sonner-native", () => ({
	toast: { success: () => {}, error: () => {} },
}));

// ── Estado de las queries de detalle ──────────────────────────────────
let detailState: "loading" | "missing" | "loaded" = "missing";

function detailQuery() {
	if (detailState === "loading") {
		return {
			data: undefined,
			isLoading: true,
			isError: false,
			refetch: () => {},
		};
	}
	if (detailState === "missing") {
		return {
			data: undefined,
			isLoading: false,
			isError: false,
			refetch: () => {},
		};
	}
	return {
		data: detailState === "loaded" ? RECORD : undefined,
		isLoading: false,
		isError: false,
		refetch: () => {},
	};
}

const RECORD = {
	id: "x-1",
	name: "Sucursal",
	address: "Av. Siempre Viva 742",
	phone: null,
	zone: null,
	latitude: -0.22,
	longitude: -78.52,
	created_at: "2026-01-01T00:00:00.000Z",
	is_active: true,
	is_headquarter: false,
	code: "PROMO1",
	type: "percent",
	value: 10,
	min_order_amount: 0,
	max_uses: null,
	expires_at: null,
	gross_amount: 1000,
	platform_fee: 150,
	net_amount: 850,
	period_start: "2026-01-01",
	period_end: "2026-01-15",
	paid_at: null,
	status: "pending",
	business: {
		id: "b-1",
		name: "Panadería",
		type: "restaurant",
		image: null,
		rating: 4.5,
		review_count: 3,
		description: null,
		website: null,
		phone: null,
		email: null,
		created_at: "2026-01-01T00:00:00.000Z",
		address: "Av. Siempre Viva 742",
		logo_url: null,
		hours: [],
		totalRescued: 12,
	},
};

mock.module("@/src/features/business/hooks", () => ({
	useBusinessProfile: () => detailQuery(),
	useBusinessLocation: () => detailQuery(),
	useBusinessCoupon: () => detailQuery(),
	useBusinessPayout: () => detailQuery(),
	useUpsertLocation: () => ({ mutate: () => {} }),
	useUpsertCoupon: () => ({ mutate: () => {} }),
	useCreateBusiness: () => ({ mutate: () => {}, isPending: false }),
	useBusinesses: () => ({
		data: businesses,
		isLoading: false,
		isError: false,
		refetch: () => {},
	}),
}));

let businesses: Array<{ id: string }> = [];

const { default: ConsumerLayout } = await import(
	"../../../../app/(consumer)/_layout"
);
const { default: BusinessLayout } = await import(
	"../../../../app/(business)/_layout"
);
const { default: IndexGate } = await import("../../../../app/index");
const { default: BusinessHub } = await import(
	"../../../../app/business/[id]/index"
);
const { default: LocationDetail } = await import(
	"../../../../app/business/[id]/locations/[locationId]"
);
const { default: LocationEdit } = await import(
	"../../../../app/business/[id]/locations/[locationId]/edit"
);
const { default: CouponEdit } = await import(
	"../../../../app/business/[id]/coupons/[couponId]/edit"
);
const { default: PayoutDetail } = await import(
	"../../../../app/business/[id]/payouts/[payoutId]"
);
const { default: BusinessNew } = await import(
	"../../../../app/my-business/business-new"
);

beforeEach(() => {
	replaced = [];
	detailState = "missing";
	businesses = [];
	authStatus = "loading";
	authProfile = null;
	authInitialized = false;
	onboardingResolved = true;
	onboardingShow = false;
});

const render = (Screen: () => unknown) =>
	renderToStaticMarkup(createElement(Screen as () => null));

// ── Layouts: "todavía no sé" → LoadingView, no `null` ────────────────

test("the consumer tab layout shows a loading state, not a blank frame without the navbar", () => {
	authStatus = "loading";
	const html = render(ConsumerLayout);

	expect(html).toContain(LOADING);
	expect(html).not.toBe("");
});

test("the business tab layout shows a loading state while the session resolves", () => {
	authStatus = "loading";
	authInitialized = false;
	const html = render(BusinessLayout);

	expect(html).toContain(LOADING);
});

test("the business tab layout still redirects a non-business viewer", () => {
	authStatus = "authenticated";
	authInitialized = true;
	authProfile = { id: "consumer-1", role: "user" };

	const html = render(BusinessLayout);

	// This one is a navigation guard, not a loading state: it must NOT be
	// swallowed by LoadingView.
	expect(html).toContain("REDIRECT:/");
	expect(html).not.toContain(LOADING);
});

test("the startup gate shows a loading state while the session or storage resolves", () => {
	authStatus = "loading";
	const html = render(IndexGate);

	expect(html).toContain(LOADING);
	expect(replaced).toEqual([]);
});

test("the startup gate hands the first-time consumer to onboarding", () => {
	authStatus = "authenticated";
	authInitialized = true;
	authProfile = { id: "consumer-1", role: "user" };
	onboardingShow = true;

	const html = render(IndexGate);

	expect(html).toContain(LOADING);
	expect(replaced).toEqual(["/onboarding"]);
});

// ── Detalle: "cargó sin datos" → EmptyState, no `null` ────────────────

const DETAIL_SCREENS: Array<
	[name: string, Screen: () => unknown, copy: string, pending: string]
> = [
	[
		"business hub",
		BusinessHub,
		strings.businessProfile.notFoundTitle,
		SKELETON,
	],
	[
		"location detail",
		LocationDetail,
		strings.business.locationNotFoundTitle,
		SKELETON,
	],
	[
		"location edit",
		LocationEdit,
		strings.business.locationNotFoundTitle,
		LOADING,
	],
	["coupon edit", CouponEdit, strings.business.couponNotFoundTitle, LOADING],
	[
		"payout detail",
		PayoutDetail,
		strings.business.payoutNotFoundTitle,
		LOADING,
	],
];

for (const [name, Screen, copy, pending] of DETAIL_SCREENS) {
	test(`${name}: a resolved-but-empty record says it does not exist`, () => {
		detailState = "missing";
		const html = render(Screen);

		expect(html).toContain(`${NOT_FOUND}:${copy}`);
		expect(html).not.toBe("");
	});

	test(`${name}: a pending query keeps showing its loading state`, () => {
		detailState = "loading";
		const html = render(Screen);

		expect(html).toContain(pending);
	});
}

// ── business-new: guard de navegación que además espera visible ──────

test("business-new keeps redirecting an owner who already has a business", () => {
	authStatus = "authenticated";
	authInitialized = true;
	authProfile = { id: "owner-1", role: "business" };
	detailState = "loaded";
	businesses = [{ id: "b-1" }];

	const html = render(BusinessNew);

	// The redirect still fires…
	expect(replaced).toContain("/(business)/products");
	// …and the frame in between is a loading state, not a blank screen.
	expect(html).toContain(LOADING);
});

test("business-new shows the creation form when there is really no business", () => {
	authStatus = "authenticated";
	authInitialized = true;
	authProfile = { id: "owner-1", role: "business" };
	businesses = [];

	expect(render(BusinessNew)).not.toContain(LOADING);
	expect(replaced).toEqual([]);
});

test("the nine screens that used to return null no longer return null at screen level", () => {
	// Source-level gate so the regression cannot come back quietly. The two
	// layouts keep two `return null` each, both in renderless helpers
	// (`TabBarCapture` writes the tab-bar snapshot, `OuterBar` paints nothing
	// until that snapshot exists). Those are not screens: they never remove the
	// navigation. The screen-level branches are what this defect was about.
	const expectations: Array<[path: string, allowed: number]> = [
		["app/index.tsx", 0],
		["app/(consumer)/_layout.tsx", 2],
		["app/(business)/_layout.tsx", 2],
		["app/business/[id]/index.tsx", 0],
		["app/business/[id]/locations/[locationId].tsx", 0],
		["app/business/[id]/locations/[locationId]/edit.tsx", 0],
		["app/business/[id]/coupons/[couponId]/edit.tsx", 0],
		["app/business/[id]/payouts/[payoutId].tsx", 0],
		["app/my-business/business-new.tsx", 0],
	];

	const offenders = expectations
		.map(([path, allowed]) => {
			const found =
				readFileSync(join(PACKAGE_ROOT, path), "utf8").match(/return null;/g)
					?.length ?? 0;
			return found === allowed
				? null
				: `${path}: ${found} (expected ${allowed})`;
		})
		.filter((entry) => entry !== null);

	expect(offenders).toEqual([]);
});

test("the screens that carried inline Spanish now read it from the catalogue", () => {
	// M25: these literals used to be typed straight into JSX, so a wording
	// change was a code change and the es-ES contract was unenforceable.
	for (const path of [
		"app/my-business/dashboard.tsx",
		"app/business/[id]/index.tsx",
		"app/business/[id]/offers.tsx",
		"app/all-offers.tsx",
		"app/all-businesses.tsx",
	]) {
		const source = readFileSync(join(PACKAGE_ROOT, path), "utf8");
		// No bare Spanish literal left in a user-facing position.
		expect(source).not.toMatch(
			/(title|message|label|placeholder)="[^"]*[áéíóúñÁÉÍÓÚÑ¿¡][^"]*"/,
		);
		expect(source).not.toMatch(/\?\?\s*"[^"]*[áéíóúñÁÉÍÓÚÑ¿¡][^"]*"/);
	}

	// And the copy they point at is in the catalogue, in es-ES.
	expect(strings.myBusiness.newBusiness).toBe("Nuevo negocio");
	expect(strings.myBusiness.emptyTitle).toBe("Aún no tienes negocios");
	expect(strings.common.loadingMore).toBe("Cargando más…");
	expect(strings.allOffers.noMore).toBe("No hay más ofertas");
	expect(strings.allBusinesses.noMore).toBe("No hay más negocios");
	expect(strings.business.noAddress).toBe("Sin dirección registrada");
	expect(NOT_FOUND_COPY.length).toBe(4);
});
