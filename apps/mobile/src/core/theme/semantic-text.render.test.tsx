import { expect, mock, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { dark, light, type ThemeScheme } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import { compositeOver, contrast } from "@/src/test-utils/contrast";
import type { OrderDetail } from "@/src/features/orders/domain/order";

/**
 * Call sites, not just tokens. `warningText` / `infoText` only earn their keep
 * if the components that reach for a semantic colour actually render with them,
 * and the order flow's primary action only counts as fixed if the label that a
 * merchant reads clears AA on the fill it is painted on.
 *
 * Before this change: "marcar listo" was 3.74:1 and "validar entrega" 2.28:1 in
 * light — both under the 4.5:1 floor for the 14px semiBold label.
 */

type TextProps = ComponentProps<typeof nativeWeb.Text>;
type ViewProps = ComponentProps<typeof nativeWeb.View>;
let texts: TextProps[] = [];
let views: ViewProps[] = [];
let scheme: ThemeScheme = "light";

mockNativeUi({
	Text: (props: TextProps) => {
		texts.push(props);
		return createElement(nativeWeb.Text, props);
	},
	View: (props: ViewProps) => {
		views.push(props);
		return createElement(nativeWeb.View, props);
	},
});
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
// The UI kit barrel reaches `@rn-primitives/dialog` through BottomSheetModal and
// the shadcn `Badge` through NativeWind, neither of which bun can parse. Neither
// carries the colour under test: the badge label is the `AppText` inside it.
mock.module("@/src/core/ui/BottomSheetModal", () => ({
	BottomSheetModal: () => null,
}));
mock.module("@/components/ui/badge", () => ({ Badge: nativeWeb.View }));
mock.module("@/components/ui/card-presable", () => ({
	CardPressable: nativeWeb.View,
}));
mock.module("@/components/ui/skeleton", () => ({ Skeleton: nativeWeb.View }));
mock.module("react-native-reanimated", () => ({
	__esModule: true,
	default: {
		View: nativeWeb.View,
		ScrollView: nativeWeb.ScrollView,
		FlatList: nativeWeb.FlatList,
	},
	Animated: { View: nativeWeb.View, FlatList: nativeWeb.FlatList },
	useSharedValue: (value: unknown) => ({ value }),
	useAnimatedStyle: (fn: () => unknown) => fn(),
	useAnimatedRef: () => null,
	useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
	cancelAnimation: () => {},
	interpolateColor: (value: unknown) => value,
	withRepeat: (value: unknown) => value,
	withSequence: (...values: unknown[]) => values[values.length - 1],
	withSpring: (value: unknown) => value,
	withTiming: (value: unknown) => value,
	Easing: {
		ease: (v: number) => v,
		inOut: (fn: unknown) => fn,
		linear: (v: number) => v,
	},
	ReduceMotion: { System: 0, Always: 1, Never: 2 },
	runOnJS: (fn: unknown) => fn,
	runOnUI: (fn: unknown) => fn,
}));
mock.module("expo-router", () => ({
	router: { push: () => {}, replace: () => {}, back: () => {} },
	useNavigation: () => ({ setOptions: () => {} }),
	useSegments: () => [],
}));
mock.module("@/components/ui/alert-dialog", () =>
	Object.fromEntries(
		[
			"AlertDialog",
			"AlertDialogAction",
			"AlertDialogCancel",
			"AlertDialogContent",
			"AlertDialogDescription",
			"AlertDialogFooter",
			"AlertDialogHeader",
			"AlertDialogTitle",
		].map((name) => [name, () => null]),
	),
);
mock.module("@/src/features/business/hooks", () => ({
	useUpdateOrderStatus: () => ({ isPending: false, mutate: () => {} }),
}));
mock.module("expo-image", () => ({ Image: nativeWeb.View }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({
		colors: scheme === "dark" ? dark : light,
		scheme,
		mode: scheme,
		setMode: () => {},
	}),
	ThemeProvider: () => null,
	light,
	dark,
}));

const { StatusBadge } = await import("@/src/core/ui");
const { StarRating } = await import(
	"@/src/features/orders/components/StarRating"
);
const { OrderStatsRow } = await import(
	"@/src/features/business/components/orders/OrderStatsRow"
);
const { OrderActionButtons } = await import(
	"@/src/features/business/components/orders/OrderActionButtons"
);
const { OrderCard } = await import(
	"@/src/features/orders/components/OrderCard"
);

function reset() {
	texts = [];
	views = [];
}

/** Every colour the renderer actually emitted, as `#RRGGBB`. */
function emittedColours(): string[] {
	const flatten = (style: unknown): string[] => {
		const flat = nativeWeb.StyleSheet.flatten(style as never) as
			| Record<string, unknown>
			| undefined;
		if (!flat) return [];
		return Object.entries(flat)
			.filter(([, value]) => typeof value === "string")
			.map(([, value]) => value as string);
	};
	return [...texts, ...views].flatMap((node) => flatten(node.style));
}

function textColours(): string[] {
	return texts
		.map((text) => nativeWeb.StyleSheet.flatten(text.style)?.color)
		.filter((color): color is string => typeof color === "string");
}

const rgb = (hex: string) => {
	const v = hex.replace("#", "").slice(0, 6);
	return [0, 2, 4].map((o) => parseInt(v.slice(o, o + 2), 16)).join(",");
};
/** The renderer writes colours as `rgb(r,g,b)` / `rgba(r,g,b,a)`. */
const rendered = (hex: string) => new RegExp(`(rgb|rgba)\\(${rgb(hex)},`);

const order = (status: OrderDetail["order"]["status"]): OrderDetail =>
	({
		order: {
			id: "order-1",
			user_id: "customer-1",
			offer_id: "offer-1",
			business_id: "business-1",
			order_number: "20260916-1234",
			status,
			price: 4,
			created_at: "2026-09-16T10:00:00Z",
			pickup_time: null,
			confirmed_at: null,
			ready_at: null,
			picked_up_at: null,
			cancelled_at: null,
			events: [],
		},
		offerTitle: "Mañana",
		businessName: "Panadería",
		offerImageUrl: null,
	}) as unknown as OrderDetail;

/**
 * The decorative hues a light-scheme render must never emit. In dark the
 * palette deliberately reuses them as the text-safe tokens — that inversion is
 * the whole point of `warningText` / `infoText` — so "the old hue is gone" is
 * only a claim light can make. `infoForeground` is not listed: it is a
 * different job (banner copy) that happens to share `infoText`'s value, so
 * seeing it proves nothing either way.
 */
function legacyHues(palette: ThemeScheme): string[] {
	return palette === "dark" ? [] : [light.warning, light.info];
}

test("the status badge paints its warning and info labels with the text-safe tokens", () => {
	for (const palette of ["light", "dark"] as const) {
		scheme = palette;
		const tokens = palette === "light" ? light : dark;
		const legacy = legacyHues(palette);

		reset();
		renderToStaticMarkup(
			createElement(StatusBadge, {
				label: strings.business.ordersPendingStat,
				tone: "warning",
			}),
		);
		const warning = emittedColours();
		expect(warning).toContain(tokens.warningText);
		for (const hue of legacy) expect(warning).not.toContain(hue);

		reset();
		renderToStaticMarkup(
			createElement(StatusBadge, { label: "Info", tone: "info" }),
		);
		const info = emittedColours();
		expect(info).toContain(tokens.infoText);
		for (const hue of legacy) expect(info).not.toContain(hue);
	}
});

test("the review stars paint the selected ones with warningText, not the amber", () => {
	for (const palette of ["light", "dark"] as const) {
		scheme = palette;
		const tokens = palette === "light" ? light : dark;
		reset();
		renderToStaticMarkup(
			createElement(StarRating, {
				label: strings.orders.rateProduct,
				value: 3,
				onChange: () => {},
			}),
		);
		const colours = textColours();
		expect(colours.filter((c) => c === tokens.warningText)).toHaveLength(3);
		for (const hue of legacyHues(palette)) expect(colours).not.toContain(hue);
	}
});

test("the business order stats paint their values with the text-safe tokens", () => {
	for (const palette of ["light", "dark"] as const) {
		scheme = palette;
		const tokens = palette === "light" ? light : dark;
		reset();
		renderToStaticMarkup(
			createElement(OrderStatsRow, {
				stats: { pendingCount: 2, readyCount: 1, todayCompletedCount: 4 },
			}),
		);
		const colours = textColours();
		// The three values are the only semantic foregrounds here; the labels are
		// muted.
		expect(colours).toContain(tokens.warningText);
		expect(colours).toContain(tokens.infoText);
		for (const hue of legacyHues(palette)) expect(colours).not.toContain(hue);
	}
});

test("the order action labels clear AA on the fills they are painted on", () => {
	const cases = [
		{
			status: "pending" as const,
			fill: "infoAction" as const,
			label: "infoActionForeground" as const,
		},
		{
			status: "confirmed" as const,
			fill: "infoAction" as const,
			label: "infoActionForeground" as const,
		},
		{
			status: "ready_for_pickup" as const,
			fill: "successAction" as const,
			label: "successActionForeground" as const,
		},
	];

	for (const palette of ["light", "dark"] as const) {
		const tokens = palette === "light" ? light : dark;
		for (const { status, fill, label } of cases) {
			scheme = palette;
			reset();
			const html = renderToStaticMarkup(
				createElement(OrderActionButtons, {
					businessId: "business-1",
					item: order(status),
				}),
			);

			// The fill really is on screen, and it is the token we claim. In light it
			// is also no longer the old hue, which is the whole point of the split;
			// in dark the two are the same value by design.
			expect(html).toMatch(rendered(tokens[fill]));
			if (palette === "light") {
				const old = fill === "infoAction" ? light.info : light.success;
				expect(html).not.toMatch(rendered(old));
			}

			// And the label is the token that pairs with it.
			const painted = textColours();
			expect(painted).toContain(tokens[label]);
			expect(
				contrast(tokens[label] as string, tokens[fill] as string),
			).toBeGreaterThanOrEqual(4.5);
		}
	}
});

test("the order action label is the one the catalogue promises", () => {
	scheme = "light";
	reset();
	const html = renderToStaticMarkup(
		createElement(OrderActionButtons, {
			businessId: "business-1",
			item: order("ready_for_pickup"),
		}),
	);
	expect(html).toContain(strings.business.ordersValidateAndDeliver);
});

test("the dark order action fills are the old hues, so the split only moves light", () => {
	scheme = "dark";
	reset();
	const html = renderToStaticMarkup(
		createElement(OrderActionButtons, {
			businessId: "business-1",
			item: order("ready_for_pickup"),
		}),
	);
	expect(html).toMatch(rendered(dark.success));
	expect(
		contrast(dark.successActionForeground, dark.successAction),
	).toBeCloseTo(7.649, 2);
	expect(compositeOver(dark.surfaceWarning, dark.card)).toBe("#55492a");
});

test("the order card progress circles use the same solid green the action button does", () => {
	// One story, one pair: the card's done circle is not a primary action, but it
	// carries a 20px glyph and the old `success` fill left it at 2.28:1. It takes
	// the same `successAction` surface, so the merchant sees one green for
	// "this order is done" everywhere in the flow.
	for (const palette of ["light", "dark"] as const) {
		scheme = palette;
		const tokens = palette === "light" ? light : dark;
		reset();
		const html = renderToStaticMarkup(
			createElement(OrderCard, { item: order("confirmed") }),
		);
		expect(html).toMatch(rendered(tokens.successAction));
		expect(
			contrast(tokens.successActionForeground, tokens.successAction),
		).toBeGreaterThanOrEqual(3);
		if (palette === "light") expect(html).not.toMatch(rendered(light.success));
	}
});
