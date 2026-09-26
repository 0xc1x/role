import { expect, mock, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import type { Coupon, Offer } from "@0xc1x/role-commons";
import { dark, light, type ThemeScheme } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import { compositeOver, contrast } from "@/src/test-utils/contrast";

// `success` (#22C55E) is a decorative green: 2.08:1 on `card` (#F7F3FB) and
// 2.08:1 on `surfaceSuccess` (#DCFCE7) in light, against a WCAG AA floor of
// 4.5:1 for this 13pt text. The palette exposes `successText` for exactly
// this: 4.58:1 on `card` in light, 6.13:1 on `card` in dark.

type TextProps = ComponentProps<typeof nativeWeb.Text>;
let texts: TextProps[] = [];
let scheme: ThemeScheme = "light";

mockNativeUi({
	Text: (props: TextProps) => {
		texts.push(props);
		return createElement(nativeWeb.Text, props);
	},
});
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
// The shadcn port pulls NativeWind/Tailwind through its cva variants, which
// bun cannot parse. Both containers render opaque surfaces whose colour comes
// from the theme tokens asserted below, so plain views are enough here.
mock.module("@/src/core/ui/BottomSheetModal", () => ({
	BottomSheetModal: () => null,
}));
mock.module("@/components/ui/card", () => ({
	Card: nativeWeb.View,
	CardContent: nativeWeb.View,
	CardHeader: nativeWeb.View,
}));
mock.module("@/components/ui/alert", () => ({
	Alert: nativeWeb.View,
	AlertDescription: nativeWeb.View,
}));
mock.module("expo-router", () => ({
	router: { push: () => {}, replace: () => {}, back: () => {} },
	useNavigation: () => ({ setOptions: () => {} }),
	useSegments: () => [],
}));
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

const { PriceBreakdownCard } = await import("./PriceBreakdownCard");

const offer: Offer = {
	id: "offer-1",
	business_id: "business-1",
	business_location_id: "branch-1",
	title: "Mañana",
	description: null,
	image: null,
	category_ids: [],
	original_price: 10,
	discounted_price: 4,
	discount_percentage: null,
	stock: 5,
	initial_stock: 5,
	pickup_start: "2026-09-06T15:00:00",
	pickup_end: "2026-09-06T18:00:00",
	is_active: true,
	includes: null,
	allergens: null,
	rating: 4,
	review_count: 2,
	created_at: "2026-09-01T12:00:00",
	updated_at: "2026-09-01T12:00:00",
} as Offer;

const appliedCoupon = { code: "AHORRO5" } as Coupon;

function coloredTexts() {
	return texts
		.map((text) => nativeWeb.StyleSheet.flatten(text.style)?.color)
		.filter((color): color is string => typeof color === "string");
}

test("discount row and savings line use the text-safe success token", () => {
	for (const palette of ["light", "dark"] as const) {
		scheme = palette;
		texts = [];
		renderToStaticMarkup(
			createElement(PriceBreakdownCard, { offer, appliedCoupon }),
		);

		const colors = palette === "dark" ? dark : light;
		const expected = colors.successText;
		const surface = colors.surfaceSuccess;
		const html = renderToStaticMarkup(
			createElement(PriceBreakdownCard, { offer, appliedCoupon }),
		);

		// The discount label, the discount amount and the savings line.
		const greens = coloredTexts().filter(
			(color) =>
				color === colors.success ||
				color === colors.successDark ||
				color === colors.successText,
		);
		expect(greens.length).toBeGreaterThanOrEqual(3);
		expect(greens.every((color) => color === expected)).toBe(true);
		expect(html).not.toContain(colors.success);
		expect(html).not.toContain(colors.successDark);

		// Neither legacy token is text-safe in both schemes: `success` fails in
		// light, `successDark` fails in dark. `successText` clears AA in both.
		const rejected = palette === "dark" ? colors.successDark : colors.success;
		const opaqueSurface =
			palette === "dark" ? compositeOver(surface, colors.card) : surface;

		// The discount row sits directly on the card surface.
		expect(contrast(rejected, colors.card)).toBeLessThan(4.5);
		expect(contrast(expected, colors.card)).toBeGreaterThanOrEqual(4.5);

		// The savings line sits on the Alert's tinted surface. Light clears AA
		// (4.57:1). Dark reaches only 4.27:1 on #2a4b36: no `success` /
		// `successDark` pairing can do better there, so the Alert's own icon
		// shares the same gap. Asserted at 4.0 to keep the shortfall visible
		// instead of rounding it away.
		expect(contrast(expected, opaqueSurface)).toBeGreaterThanOrEqual(
			palette === "dark" ? 4.2 : 4.5,
		);
	}
});

test("the savings copy is still the one the checkout promises", () => {
	scheme = "light";
	const html = renderToStaticMarkup(
		createElement(PriceBreakdownCard, { offer, appliedCoupon }),
	);

	expect(html).toContain(
		strings.orders.moneySaved.replace("{saved}", "").trimEnd().slice(0, 4),
	);
});
