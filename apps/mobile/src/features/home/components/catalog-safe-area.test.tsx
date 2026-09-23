import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { spacing } from "@/src/core/theme/spacing";

let top = 0;
let isLoading = true;
const views: Record<string, number>[] = [];
const lists: any[] = [];
const refetch = mock(() => {});
const query = () => ({
	data: { pages: [[{ id: "item", offer: { id: "offer" } }]] },
	isLoading,
	isFetching: false,
	refetch,
});
const empty = () => null;
mock.module("react-native", () => ({
	...nativeWeb,
	View: ({ children, style }: { children?: ReactNode; style?: unknown }) => {
		views.push(nativeWeb.StyleSheet.flatten(style) ?? {});
		return createElement(nativeWeb.View, { style }, children);
	},
	FlatList: (props: any) => { lists.push(props); return null; },
	RefreshControl: empty,
}));
mock.module("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top, bottom: 0, left: 0, right: 0 }) }));
mock.module("expo-router", () => ({ router: {}, useLocalSearchParams: () => ({}) }));
mock.module("@/src/core/theme", () => ({ useTheme: () => ({ colors: light }) }));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text, CircleIconButton: empty, EmptyState: empty,
	FilterChip: empty, SearchBar: empty, goBackOr: empty,
	useWebPullToRefresh: () => ({ ref: undefined, indicator: null }),
}));
mock.module("@/components/ui/button", () => ({ Button: empty }));
mock.module("@/components/ui/text", () => ({ Text: nativeWeb.Text }));
mock.module("@/components/ui/skeleton", () => ({ Skeleton: empty }));
mock.module("@/src/features/hooks", () => ({
	useSelectedAddress: empty, useCategories: () => ({ data: [] }),
	useAllBusinessesInfinite: query, useFilteredOffersInfinite: query,
}));
mock.module("@/src/features/auth/store", () => ({ useAuthStore: () => ({ id: "consumer" }) }));
mock.module("@/src/features/profile/hooks", () => ({ usePreferences: () => ({}) }));
mock.module("@/src/features/business/components/BusinessGridCard", () => ({ BusinessGridCard: empty }));
mock.module("@/src/features/home/components/CategoryChips", () => ({ ChipsBar: empty }));
mock.module("@/src/features/offers/components/OfferGridCard", () => ({ OfferGridCard: empty }));
mock.module("@/src/features/offers/components/OfferFiltersSheet", () => ({ OfferFiltersSheet: empty }));
const { default: AllBusinessesScreen } = await import("../../../../app/all-businesses");
const { default: AllOffersScreen } = await import("../../../../app/all-offers");

for (const Screen of [AllBusinessesScreen, AllOffersScreen]) {
	for (const inset of [0, 44]) {
		for (const loading of [true, false]) {
			test(`${Screen.name}: top inset ${inset}, loading ${loading}`, () => {
				top = inset;
				isLoading = loading;
				views.length = 0;
				lists.length = 0;
				renderToStaticMarkup(createElement(Screen));
				const headers = views.filter((style) => style.paddingHorizontal === spacing.xl && style.gap === spacing.md);
				expect(headers).toHaveLength(1);
				expect(headers[0].paddingTop).toBe(spacing.xl + inset);
				expect(views[0].paddingTop ?? 0).toBe(0);
				expect(lists).toHaveLength(1);
				expect(lists[0].numColumns).toBe(2);
				if (loading) {
					expect(lists[0].data).toHaveLength(6);
					expect(lists[0].scrollEnabled).toBe(false);
				} else {
					expect(lists[0].refreshControl.props.refreshing).toBe(false);
					lists[0].refreshControl.props.onRefresh();
					expect(refetch).toHaveBeenCalled();
				}
			});
		}
	}
}
