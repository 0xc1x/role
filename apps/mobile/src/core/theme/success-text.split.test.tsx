import { expect, mock, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { dark, light, type ThemeScheme } from "@/src/core/theme/colors";
import { withAlpha } from "@/src/core/theme/alpha";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import { compositeOver, contrast } from "@/src/test-utils/contrast";

// The offer detail save pill is the one call site that used `success` for two
// roles at once: the translucent pill wash (decorative) and the amount inside
// it (text). They had to be split — the wash stays `success`, the text moved to
// `successText`, which lifts it from 1.91:1 to 4.21:1 on the same wash.

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
mock.module("@/src/core/ui/BottomSheetModal", () => ({
	BottomSheetModal: () => null,
}));
mock.module("@/components/ui/card", () => ({
	Card: nativeWeb.View,
	CardContent: nativeWeb.View,
	CardHeader: nativeWeb.View,
	CardDescription: nativeWeb.View,
	CardFooter: nativeWeb.View,
}));
mock.module("@/src/core/ui", async () => {
	const actual = await import("@/src/core/ui/AppText");
	return { AppText: actual.AppText, BottomSheetModal: () => null };
});
mock.module("@/src/features/offers/components/detail/InfoPrimitives", () => ({
	CategoryBadge: () => null,
	InfoCard: nativeWeb.View,
	InfoRow: () => null,
}));
mock.module("@/components/ui/button", () => ({ Button: nativeWeb.View }));
mock.module("expo-image", () => ({ Image: nativeWeb.View }));
mock.module("expo-router", () => ({ router: { push: () => {} } }));
mock.module("@/src/features/hooks", () => ({ useSelectedAddress: () => null }));
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

const { OfferContent } = await import(
	"@/src/features/offers/components/detail/OfferContent"
);

const data = {
	offer: {
		id: "offer-1",
		business_id: "business-1",
		business_location_id: "branch-1",
		title: "Mañana",
		description: "Pan de masa madre",
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
		includes: "Harina, agua, sal",
		allergens: null,
		rating: 4,
		review_count: 2,
		created_at: "2026-09-01T12:00:00",
		updated_at: "2026-09-01T12:00:00",
	},
	business: {
		id: "business-1",
		name: "Panadería",
		type: "bakery",
		image: null,
		rating: 4.5,
		review_count: 20,
	},
	location: {
		id: "branch-1",
		name: "Centro",
		address: "Calle Mayor 1",
		latitude: 40.4168,
		longitude: -3.7038,
		zone: null,
	},
	categories: [],
} as never;

/** The renderer emits colours as `rgba(r,g,b,a)`, so match in that form. */
function backgroundOf(html: string, hex: string, alpha: number): boolean {
	const v = hex.replace("#", "").slice(0, 6);
	const [r, g, b] = [0, 2, 4].map((o) => parseInt(v.slice(o, o + 2), 16));
	return html.includes(
		`background-color:rgba(${r},${g},${b},${alpha.toFixed(2)})`,
	);
}

test("the save pill splits its wash from its text: successText inside, success outside", () => {
	scheme = "light";
	texts = [];
	const html = renderToStaticMarkup(createElement(OfferContent, { data }));
	const colors = light;

	// The amount inside the pill is text, so it takes the text-safe token.
	const amount = texts
		.map((text) => nativeWeb.StyleSheet.flatten(text.style)?.color)
		.find((color) => color === colors.success || color === colors.successText);
	expect(amount).toBe(colors.successText);

	// The pill wash is decorative and stays on `success`.
	expect(backgroundOf(html, colors.success, 0.102)).toBe(true);
	expect(backgroundOf(html, colors.successText, 0.102)).toBe(false);
});

test("the split is what buys the contrast: 1.91:1 becomes 4.21:1 on the same wash", () => {
	const colors = light;
	const wash = compositeOver(withAlpha(colors.success, 0.102), colors.card);
	expect(contrast(colors.success, wash)).toBeLessThan(2);
	expect(contrast(colors.successText, wash)).toBeGreaterThanOrEqual(4.2);
});
