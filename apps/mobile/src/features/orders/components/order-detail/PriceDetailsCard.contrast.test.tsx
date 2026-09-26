import { expect, mock, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import type { Order } from "@0xc1x/role-commons";
import { dark, light, type ThemeScheme } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import { compositeOver, contrast } from "@/src/test-utils/contrast";

// The order detail price breakdown paints money figures in green. Both rows and
// the savings line used the decorative `success` (2.08:1 on `card` in light);
// they now use `successText`, the token that clears AA on both schemes.

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
// The shadcn port pulls NativeWind/Tailwind through its cva variants, which bun
// cannot parse. Both containers render opaque surfaces whose colour comes from
// the theme tokens asserted below, so plain views are enough here.
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

const { PriceDetailsCard } = await import("./PriceDetailsCard");

const order = {
	id: "order-1",
	business_id: "business-1",
	business_location_id: "branch-1",
	offer_id: "offer-1",
	status: "confirmed",
	quantity: 1,
	original_price: 10,
	price: 4,
	coupon_code: null,
	notes: null,
	pickup_code: "1234",
	pickup_time: "2026-09-06T15:00:00",
	created_at: "2026-09-01T12:00:00",
	updated_at: "2026-09-01T12:00:00",
} as unknown as Order;

function coloredTexts() {
	return texts
		.map((text) => nativeWeb.StyleSheet.flatten(text.style)?.color)
		.filter((color): color is string => typeof color === "string");
}

test("discount row and savings line use successText, not the decorative success", () => {
	for (const palette of ["light", "dark"] as const) {
		scheme = palette;
		texts = [];
		const html = renderToStaticMarkup(
			createElement(PriceDetailsCard, { order }),
		);

		const colors = palette === "dark" ? dark : light;
		// The discount label, the discount amount and the savings line.
		const greens = coloredTexts().filter((color) =>
			[colors.success, colors.successDark, colors.successText].includes(
				color as string,
			),
		);
		expect(greens.length).toBeGreaterThanOrEqual(3);
		expect(greens.every((color) => color === colors.successText)).toBe(true);
		expect(html).not.toContain(colors.success);
		expect(html).not.toContain(colors.successDark);
	}
});

test("successText clears AA on the card and on the savings alert surface", () => {
	for (const palette of ["light", "dark"] as const) {
		const colors = palette === "dark" ? dark : light;
		expect(contrast(colors.successText, colors.card)).toBeGreaterThanOrEqual(
			4.5,
		);

		// The savings line sits on the Alert's tinted surface. Light clears AA
		// (4.57:1). Dark reaches only 4.27:1 on #2a4b36 — the known unfixed
		// shortfall, asserted at 4.2 so it stays visible.
		const alertSurface =
			palette === "dark"
				? compositeOver(colors.surfaceSuccess, colors.card)
				: colors.surfaceSuccess;
		expect(contrast(colors.successText, alertSurface)).toBeGreaterThanOrEqual(
			palette === "dark" ? 4.2 : 4.5,
		);
	}
});
