import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { spacing } from "@/src/core/theme/spacing";
import { strings } from "@/src/core/i18n/strings";
import { emptyExploreFilters } from "../exploreTypes";

let top = 0;
const views: Record<string, unknown>[] = [];
const buttons: any[] = [];
let map: any;
const empty = () => null;
mock.module("react-native", () => ({
	...nativeWeb,
	View: ({ children, style }: { children?: ReactNode; style?: unknown }) => {
		views.push(nativeWeb.StyleSheet.flatten(style) ?? {});
		return createElement(nativeWeb.View, { style }, children);
	},
	Pressable: (props: any) => { buttons.push(props); return createElement(nativeWeb.View, {}, props.children); },
}));
mock.module("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top, bottom: 34, left: 0, right: 0 }) }));
mock.module("react-native-maps", () => ({ default: (props: any) => { map = props; return null; }, Marker: empty }));
mock.module("expo-router", () => ({ router: {} }));
mock.module("expo-image", () => ({ Image: empty }));
mock.module("expo-location", () => ({}));
mock.module("expo-linear-gradient", () => ({ LinearGradient: empty }));
mock.module("@/src/core/theme", () => ({ useTheme: () => ({ colors: light, scheme: "light" }) }));
mock.module("@/src/core/ui", () => ({ AppText: nativeWeb.Text }));
mock.module("@/src/features/hooks", () => ({ useCategories: () => ({ data: [] }) }));
const { ExploreMapView } = await import("./ExploreMapView.native");

for (const inset of [0, 44]) {
	test(`native map overlays respect top inset ${inset} without insetting the map or bottom twice`, () => {
		top = inset;
		views.length = 0;
		buttons.length = 0;
		const onBack = mock(() => {});
		const onFilterTap = mock(() => {});
		renderToStaticMarkup(createElement(ExploreMapView, {
			offers: [], filters: emptyExploreFilters, userLocation: null, onBack, onFilterTap,
		}));
		const header = views.find((style) => style.position === "absolute" && style.left === spacing.lg && style.top !== undefined);
		expect(header?.top).toBe(spacing.md + inset);
		const zoom = views.find((style) => style.position === "absolute" && style.overflow === "hidden");
		expect(zoom?.top).toBe(96 + inset);
		expect(views[0]).toEqual({ flex: 1 });
		expect(nativeWeb.StyleSheet.flatten(map.style)).toEqual(nativeWeb.StyleSheet.absoluteFillObject);
		expect(views.some((style) => style.bottom === 80)).toBe(true);
		expect(views.some((style) => style.bottom === spacing.xxl)).toBe(true);
		expect(map.onRegionChangeComplete).toBeFunction();
		expect(map.onPress).toBeFunction();
		expect(map.scrollEnabled).not.toBe(false);
		buttons.find((button) => button.accessibilityLabel === strings.common.back).onPress();
		buttons.find((button) => button.accessibilityLabel === strings.explore.filters).onPress();
		expect(onBack).toHaveBeenCalledTimes(1);
		expect(onFilterTap).toHaveBeenCalledTimes(1);
	});
}
