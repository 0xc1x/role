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

// `success` (#22C55E) is a decorative green: 2.08:1 on `card` (#F7F3FB) and
// 2.08:1 on `surfaceSuccess` (#DCFCE7) in light, against a WCAG AA floor of
// 4.5:1 for this 13pt text. In dark the same token pair inverts, so the fix has
// to follow the scheme, exactly like the Alert primitive already does for its
// own icon.

/** WCAG 2.1 relative luminance: 0.2126R + 0.7152G + 0.0722B, linearised. */
function luminance(hex: string): number {
	const value = hex.replace("#", "");
	const channels = [0, 2, 4].map((offset) => {
		const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return (
		0.2126 * (channels[0] as number) +
		0.7152 * (channels[1] as number) +
		0.0722 * (channels[2] as number)
	);
}

/** WCAG 2.1 contrast ratio between two opaque colours. */
function contrast(a: string, b: string): number {
	const [lighter, darker] = [luminance(a), luminance(b)].sort(
		(x, y) => y - x,
	) as [number, number];
	return (lighter + 0.05) / (darker + 0.05);
}

/** Flattens `#RRGGBBAA` over an opaque backdrop the way the device does. */
function compositeOver(top: string, bottom: string): string {
	const read = (hex: string, offset: number) =>
		parseInt(hex.replace("#", "").slice(offset, offset + 2), 16);
	const alpha = read(top, 6) / 255;
	const channel = (offset: number) =>
		Math.round(read(top, offset) * alpha + read(bottom, offset) * (1 - alpha))
			.toString(16)
			.padStart(2, "0");
	return `#${channel(0)}${channel(2)}${channel(4)}`;
}

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

test("discount row and savings line use the scheme's accessible success token", () => {
	for (const palette of ["light", "dark"] as const) {
		scheme = palette;
		texts = [];
		renderToStaticMarkup(
			createElement(PriceBreakdownCard, { offer, appliedCoupon }),
		);

		const colors = palette === "dark" ? dark : light;
		const expected = palette === "dark" ? colors.success : colors.successDark;
		const surface = colors.surfaceSuccess;
		const html = renderToStaticMarkup(
			createElement(PriceBreakdownCard, { offer, appliedCoupon }),
		);

		// The discount label, the discount amount and the savings line.
		const greens = coloredTexts().filter(
			(color) => color === colors.success || color === colors.successDark,
		);
		expect(greens.length).toBeGreaterThanOrEqual(3);
		expect(greens.every((color) => color === expected)).toBe(true);
		expect(html).not.toContain(
			palette === "dark" ? colors.successDark : colors.success,
		);

		// The decorative token fails AA; the accessible one clears it.
		const decorative = palette === "dark" ? colors.successDark : colors.success;
		const opaqueSurface =
			palette === "dark" ? compositeOver(surface, colors.card) : surface;

		// The discount row sits directly on the card surface.
		expect(contrast(decorative, colors.card)).toBeLessThan(4.5);
		expect(contrast(expected, colors.card)).toBeGreaterThanOrEqual(4.5);

		// The savings line sits on the Alert's tinted surface. Light clears AA
		// (4.57:1). Dark reaches only 4.27:1 on #2a4b36: no `success` /
		// `successDark` pairing can do better there, so the Alert's own icon
		// shares the same gap. Asserted at 4.0 to keep the shortfall visible
		// instead of rounding it away.
		expect(contrast(decorative, opaqueSurface)).toBeLessThan(4.5);
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
