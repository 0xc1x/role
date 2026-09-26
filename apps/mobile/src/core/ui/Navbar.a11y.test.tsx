import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { dark, light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

// The active tab existed only as the animated pill, so a screen reader heard
// four identical buttons with no indication of which one is current.

type ViewProps = ComponentProps<typeof nativeWeb.View>;
type PressableProps = ComponentProps<typeof nativeWeb.Pressable>;
let views: ViewProps[] = [];
let tabs: PressableProps[] = [];

mockNativeUi({
	View: (props: ViewProps) => {
		views.push(props);
		return createElement(nativeWeb.View, props);
	},
	Pressable: (props: PressableProps) => {
		tabs.push(props);
		return createElement(nativeWeb.Pressable, props);
	},
});
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
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

const { default: Navbar } = await import("@/src/core/ui/Navbar");

const TABS = ["home", "explore", "favorites", "profile"] as const;

// `BottomTabBarProps` is a deep navigator type; the bar only reads a handful of
// fields, so the fixture is described structurally instead of faking the whole
// navigation (and instead of falling back to `any`).
type TabRoute = { key: string; name: string };

type TabBarFixture = {
	fallbackTabName?: string;
	state: {
		index: number;
		routes: TabRoute[];
		key: string;
		type: "tab";
		routeNames: readonly string[];
	};
	descriptors: Record<string, unknown>;
	navigation: unknown;
	insets: { top: number; bottom: number; left: number; right: number };
};

function tabBarProps(index: number): TabBarFixture {
	const routes = TABS.map((name) => ({ key: `k-${name}`, name }));
	const descriptors = Object.fromEntries(
		routes.map((route) => [
			route.key,
			{
				options: {
					title: strings.common.back,
					tabBarLabel: route.name,
					tabBarIcon: ({ size }: { size: number }) =>
						createElement(nativeWeb.View, { "data-icon": size } as never),
				},
			},
		]),
	);
	return {
		fallbackTabName: undefined,
		state: {
			index,
			routes,
			key: "tabs",
			type: "tab" as const,
			routeNames: TABS,
		},
		descriptors,
		navigation: {
			emit: () => ({ defaultPrevented: false }),
			navigate: mock(() => {}),
		} as never,
		insets: { top: 0, bottom: 0, left: 0, right: 0 },
	};
}

beforeEach(() => {
	views = [];
	tabs = [];
});

test("the bar is a tab list and each tab announces whether it is selected", () => {
	for (const index of [0, 2, 3]) {
		views = [];
		tabs = [];
		const html = renderToStaticMarkup(
			createElement(Navbar, tabBarProps(index) as never),
		);

		const tablists = views.filter(
			(view) => view.accessibilityRole === "tablist",
		);
		// Exactly one tab list, and it is the row that wraps only the
		// interactive tabs — the decorative pill layer must stay outside it.
		expect(tablists).toHaveLength(1);
		const tablist = tablists[0];
		expect(tablist).not.toBe(views[0]);
		expect(nativeWeb.StyleSheet.flatten(tablist?.style)).toMatchObject({
			flex: 1,
			flexDirection: "row",
		});
		expect(nativeWeb.StyleSheet.flatten(tablist?.style)).not.toMatchObject({
			position: "absolute",
		});

		expect(tabs).toHaveLength(TABS.length);
		expect(html).toContain('role="tablist"');
		for (const [position, tab] of tabs.entries()) {
			expect(tab.accessibilityRole).toBe("tab");
			expect(tab.accessibilityLabel).toBe(TABS[position]);
			expect(tab.accessibilityState).toEqual({ selected: position === index });
		}
	}
});

test("a deep link onto a hidden tab still marks exactly one visible tab", () => {
	views = [];
	tabs = [];
	const props = tabBarProps(0);
	// The active route is hidden (`href: null` -> display:none), so the bar
	// falls back to `explore` instead of pointing at nothing.
	props.state.routes = [
		...props.state.routes,
		{ key: "k-hidden", name: "hidden" },
	];
	props.state.index = TABS.length;
	props.descriptors["k-hidden"] = {
		options: {
			title: "hidden",
			tabBarItemStyle: { display: "none" },
			tabBarIcon: () => null,
		},
	};
	props.fallbackTabName = "explore";

	renderToStaticMarkup(createElement(Navbar, props as never));

	expect(tabs).toHaveLength(TABS.length);
	expect(tabs.map((tab) => tab.accessibilityState?.selected)).toEqual([
		false,
		true,
		false,
		false,
	]);
});
