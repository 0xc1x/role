import { expect, mock, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import type { OfferDetail } from "@/src/features/offers/domain/offer";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

// OfferCard is the most repeated element in the app. Its title pinned a fixed
// `height` for two lines, so at a large system font size the second line was
// cut through the middle of the glyphs.

type TextProps = ComponentProps<typeof nativeWeb.Text>;
let texts: TextProps[] = [];

mockNativeUi({
	Text: (props: TextProps) => {
		texts.push(props);
		return createElement(nativeWeb.Text, props);
	},
});
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
// The `@/src/core/ui` barrel re-exports BottomSheetModal, whose portal
// primitive ships JSX inside .mjs.
mock.module("@/src/core/ui/BottomSheetModal", () => ({
	BottomSheetModal: () => null,
}));
mock.module("expo-image", () => ({ Image: nativeWeb.View }));
mock.module("expo-router", () => ({
	router: { push: () => {}, replace: () => {}, back: () => {} },
	useNavigation: () => ({ setOptions: () => {} }),
	useSegments: () => [],
}));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
	ThemeProvider: () => null,
	light,
}));
mock.module("@/src/features/hooks", () => ({
	useIsFavorite: () => false,
	useToggleFavorite: () => ({ mutate: () => {}, isPending: false }),
	useSelectedAddress: () => null,
}));
mock.module("@/src/features/auth/store", () => ({
	useAuthStore: (selector: (s: { profile: null }) => unknown) =>
		selector({ profile: null }),
}));

const { OfferCard } = await import("./OfferCard");

const offer: OfferDetail = {
	offer: {
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
	},
	business: {
		id: "business-1",
		name: "Panadería",
		type: "bakery",
		image: null,
		rating: 4,
		review_count: 2,
	},
	location: null,
	categories: [],
};

test("the card title grows past two lines instead of clipping the second", () => {
	texts = [];
	renderToStaticMarkup(createElement(OfferCard, { offer }));

	const title = texts.find((text) => text.numberOfLines === 2);
	expect(title).toBeDefined();
	expect(title?.maxFontSizeMultiplier).toBe(1.25);

	const style = nativeWeb.StyleSheet.flatten(title?.style) ?? {};
	// 1.25 × 15pt = 18.75pt, which still fits the 19pt line box, so a large
	// system font enlarges the block rather than being cropped by it.
	expect(style).toMatchObject({ fontSize: 15, lineHeight: 19 });
	expect(style.minHeight).toBe(38);
	expect(style.height).toBeUndefined();
});
