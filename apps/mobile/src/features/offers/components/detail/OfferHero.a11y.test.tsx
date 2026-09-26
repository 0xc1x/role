import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { dark, light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

// Back and favorite sat on the most important screen in the product and both
// rendered as a bare "button": their props already accepted a label, the
// catalogue strings already existed, and neither was passed.

type PressableProps = ComponentProps<typeof nativeWeb.Pressable>;
let buttons: PressableProps[] = [];

mockNativeUi({
	Pressable: (props: PressableProps) => {
		buttons.push(props);
		return createElement(nativeWeb.Pressable, props);
	},
});
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("expo-image", () => ({ Image: nativeWeb.View }));
mock.module("expo-linear-gradient", () => ({ LinearGradient: nativeWeb.View }));
// `OfferHero` imports the `@/src/core/ui` barrel, which re-exports
// BottomSheetModal (its portal primitive ships JSX inside .mjs).
mock.module("@/src/core/ui/BottomSheetModal", () => ({
	BottomSheetModal: () => null,
}));
mock.module("expo-router", () => ({
	router: { push: () => {}, replace: () => {}, back: () => {} },
	useNavigation: () => ({ setOptions: () => {} }),
	useSegments: () => [],
}));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
	ThemeProvider: () => null,
	light,
	dark,
	colorTokens: { light, dark },
}));

const { OfferHero } = await import(
	"@/src/features/offers/components/detail/OfferHero"
);

function renderHero(isFavorite: boolean) {
	buttons = [];
	renderToStaticMarkup(
		// `headerHeight`/`headerOpacity` are reanimated interpolations; the
		// static values are only there to keep the tree renderable in SSR.
		createElement(OfferHero, {
			image: null,
			headerHeight: 0 as never,
			headerOpacity: 0 as never,
			topOffset: 0,
			isFavorite,
			onToggleFavorite: () => {},
		}),
	);
	return buttons;
}

beforeEach(() => {
	buttons = [];
});

test("back and favorite both carry a label on the offer detail hero", () => {
	const html = renderToStaticMarkup(
		createElement(OfferHero, {
			image: null,
			headerHeight: 0 as never,
			headerOpacity: 0 as never,
			topOffset: 0,
			isFavorite: false,
			onToggleFavorite: () => {},
		}),
	);

	expect(buttons).toHaveLength(2);
	for (const button of buttons) {
		expect(button.accessibilityRole).toBe("button");
		expect(button.accessibilityLabel).toBeTruthy();
	}
	expect(buttons[0]?.accessibilityLabel).toBe(strings.common.back);
	expect(buttons[1]?.accessibilityLabel).toBe(strings.offers.addToFavorites);
	expect(html).toContain(`aria-label="${strings.common.back}"`);
	expect(html).toContain(`aria-label="${strings.offers.addToFavorites}"`);
});

test("the favorite label follows the favorite state", () => {
	expect(renderHero(false)[1]?.accessibilityLabel).toBe(
		strings.offers.addToFavorites,
	);
	expect(renderHero(true)[1]?.accessibilityLabel).toBe(
		strings.offers.removeFromFavorites,
	);
});
