import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { spacing } from "@/src/core/theme/spacing";

type Props = { children?: ReactNode; style?: unknown; className?: string };
const views: Props[] = [];
const presses: any[] = [];
const push = mock(() => {});
const wrapper = ({ children }: Props) =>
	createElement(nativeWeb.View, null, children);
let InteropView: any;
let InteropPressable: any;
let pressed = false;
mock.module("react-native", () => ({
	...nativeWeb,
	View: (props: Props) => createElement(InteropView, props),
	Pressable: (props: Props) => createElement(InteropPressable, props),
}));
// Run the installed native interop, not the web interop or a style-prop mock.
const { cssInterop } = await import(
	"react-native-css-interop/dist/runtime/native/api"
);
InteropView = cssInterop(
	(props: Props) => {
		views.push(props);
		return createElement(nativeWeb.View, props);
	},
	{ className: "style" },
);
InteropPressable = cssInterop(
	(props: any) => {
		presses.push(props);
		return createElement(nativeWeb.Pressable, {
			...props,
			testOnly_pressed: pressed,
		});
	},
	{ className: "style" },
);
// Card only uses TextClassContext; Slot is not rendered in this scenario.
mock.module("@rn-primitives/slot", () => ({ Slot: {} }));
mock.module("expo-router", () => ({ router: { push } }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));
mock.module("@/src/features/auth/store", () => ({
	useAuthStore: () => ({ id: "owner" }),
}));
mock.module("@/src/features/business/hooks", () => ({
	useBusinesses: () => ({ data: [{ id: "business-1" }] }),
	useBusinessStats: () => ({
		data: {
			revenue: 0,
			revenueChange: 0,
			ordersCount: 0,
			ordersChange: 0,
			rescuedCount: 0,
			rescuedChange: 0,
			avgRating: 4.5,
			dailyStats: [],
			topProducts: [],
		},
	}),
}));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	Screen: wrapper,
	ScreenHeader: () => null,
	EmptyState: () => null,
	ErrorState: () => null,
}));
mock.module("@/components/ui/skeleton", () => ({ Skeleton: () => null }));
mock.module("@/components/ui/button", () => ({ Button: () => null }));
const { default: BusinessStatsScreen } = await import(
	"../../../../app/business/[id]/stats"
);

const styleOf = (props: Props) =>
	nativeWeb.StyleSheet.flatten(props.style) ?? {};

test("installed native interop drops Pressable callback styles", () => {
	const callback = mock(() => ({
		flexBasis: "47%",
		flexGrow: 1,
		flexShrink: 1,
	}));
	renderToStaticMarkup(createElement(InteropPressable, { style: callback }));
	expect(presses.at(-1).style).toEqual({});
	expect(callback).not.toHaveBeenCalled();
	presses.length = 0;
	views.length = 0;
});

test("native interop retains two equal KPI columns and full-width review surface", () => {
	const html = renderToStaticMarkup(createElement(BusinessStatsScreen));
	expect(html).toContain(strings.business.avgRating);
	expect(html).toContain("4.5");
	const rows = views.filter((view) => {
		const style = styleOf(view);
		return style.width === "100%" && style.flexDirection === "row";
	});
	expect(rows).toHaveLength(2);
	for (const row of rows) {
		expect(styleOf(row).gap).toBe(spacing.md);
		expect((row.children as ReactNode[]).filter(Boolean)).toHaveLength(2);
	}
	const columns = views.filter((view) => styleOf(view).minWidth === 0);
	expect(columns).toHaveLength(4);
	for (const column of columns)
		expect(styleOf(column)).toEqual({ flex: 1, minWidth: 0 });
	// Inspect real Card output after native interop; no Card mock hides its surface or sizing.
	const cards = views.filter(
		(view) => styleOf(view).backgroundColor === light.card,
	);
	expect(cards).toHaveLength(6);
	for (const card of cards.slice(0, 4)) {
		expect(styleOf(card)).toMatchObject({
			width: "100%",
			flexGrow: 1,
			borderColor: light.borderSolid,
		});
	}
	const reviews = presses.find((props) => typeof props.children === "function");
	expect(reviews).toBeDefined();
	expect(reviews.style).toMatchObject({ width: "100%", flexGrow: 1 });
	expect(reviews.accessibilityRole).toBe("button");
	reviews.onPress();
	expect(push).toHaveBeenCalledWith("/business/business-1/reviews");
	views.length = 0;
	pressed = true;
	renderToStaticMarkup(createElement(BusinessStatsScreen));
	expect(views.filter((view) => styleOf(view).opacity === 0.9)).toHaveLength(1);
});
