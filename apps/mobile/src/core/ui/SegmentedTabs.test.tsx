import { expect, mock, test } from "bun:test";
import { plugin } from "bun";
import { createRequire } from "node:module";
import { cssToReactNativeRuntime } from "react-native-css-interop/css-to-rn";

// The installed primitive ships JSX in .mjs; Metro handles this in the app.
plugin({
	name: "tabs-jsx",
	setup(build) {
		build.onLoad(
			{ filter: /\/tabs\/dist\/tabs(?:\.web)?\.mjs$/ },
			async ({ path }) => ({
				contents: await Bun.file(path).text(),
				loader: "jsx",
			}),
		);
	},
});
import { createElement, type ComponentProps } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Use the installed React Native Web renderer for SSR.
import * as nativeWeb from "react-native-web";
import { strings } from "@/src/core/i18n/strings";
import { dark, light } from "@/src/core/theme/colors";
import { withAlpha } from "@/src/core/theme/alpha";
import { radii, spacing } from "@/src/core/theme/spacing";
import { fonts, typography } from "@/src/core/theme/typography";

type ProbeProps = ComponentProps<typeof nativeWeb.View>;
let colors = light;
let views: ProbeProps[] = [];
let triggers: ProbeProps[] = [];
let texts: ProbeProps[] = [];
mock.module("react-native", () => ({
	...nativeWeb,
	View: (props: ProbeProps) => {
		views.push(props);
		return createElement(nativeWeb.View, props);
	},
	Pressable: (props: ProbeProps) => {
		triggers.push(props);
		return createElement(nativeWeb.Pressable, props);
	},
	Text: (props: ProbeProps) => {
		texts.push(props);
		return createElement(nativeWeb.Text, props);
	},
}));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.View }));
mock.module("@/src/core/theme", () => ({ useTheme: () => ({ colors }) }));
const nativeTabs = { ...(await import("@rn-primitives/tabs")) };
const webTabs = await import(
	import.meta
		.resolve("@rn-primitives/tabs")
		.replace("index.mjs", "tabs.web.mjs")
);
let useWebTabs = false;
mock.module("@rn-primitives/tabs", () => ({
	Root: (props: ComponentProps<typeof nativeTabs.Root>) =>
		createElement(useWebTabs ? webTabs.Root : nativeTabs.Root, props),
	List: (props: ComponentProps<typeof nativeTabs.List>) =>
		createElement(useWebTabs ? webTabs.List : nativeTabs.List, props),
	Trigger: (props: ComponentProps<typeof nativeTabs.Trigger>) =>
		createElement(useWebTabs ? webTabs.Trigger : nativeTabs.Trigger, props),
	Content: nativeTabs.Content,
	useRootContext: () => (useWebTabs ? webTabs : nativeTabs).useRootContext(),
}));
const { SegmentedTabs } = await import("./SegmentedTabs");
const { OrdersTabs } = await import(
	"@/src/features/business/components/orders/OrdersTabs"
);

test("compiled NativeWind padding is overridden per edge", async () => {
	const require = createRequire(import.meta.url);
	const tailwindPath = require.resolve("tailwindcss");
	const postcss = createRequire(tailwindPath)("postcss");
	const tailwind = require("tailwindcss");
	triggers = [];
	renderToStaticMarkup(
		createElement(SegmentedTabs, {
			value: "active",
			items: [{ key: "active", label: "Active" }],
			onValueChange: () => {},
		}),
	);
	const trigger = triggers[0];
	const classes = trigger.className
		.split(/\s+/)
		.filter((name: string) => /^(px|py)-/.test(name));
	const { css } = await postcss([
		tailwind({
			content: [{ raw: classes.join(" ") }],
			corePlugins: { preflight: false },
		}),
	]).process("@tailwind utilities;", { from: undefined });
	const compiled = cssToReactNativeRuntime(css, { inlineRem: 14 });
	const defaults = Object.assign(
		{},
		...Object.values(compiled.rules ?? {}).flatMap(
			(rule) =>
				rule.n?.flatMap(
					(style) => style.d?.map((declaration) => declaration[0]) ?? [],
				) ?? [],
		),
	);
	expect(defaults).toMatchObject({
		paddingTop: 3.5,
		paddingBottom: 3.5,
		paddingLeft: 7,
		paddingRight: 7,
	});
	expect(nativeWeb.StyleSheet.flatten([defaults, trigger.style])).toMatchObject(
		{
			paddingTop: 9,
			paddingBottom: 9,
			paddingLeft: 0,
			paddingRight: 0,
		},
	);
});

test("web primitive does not reference nonexistent panels", () => {
	useWebTabs = true;
	try {
		const html = renderToStaticMarkup(
			createElement(SegmentedTabs, {
				value: "active",
				items: [
					{ key: "active", label: "Active" },
					{ key: "past", label: "Past" },
				],
				onValueChange: () => {},
			}),
		);
		expect(html.match(/role="tab"/g)).toHaveLength(2);
		expect(html).toContain('aria-selected="true"');
		expect(html).not.toContain("aria-controls=");
	} finally {
		useWebTabs = false;
	}
});

test("order tabs retain customer styling, labels and controlled selection through RNR", () => {
	const customerItems = [
		{ key: "active", label: strings.orders.tabActive.replace("{n}", "0") },
		{ key: "past", label: strings.orders.tabPast.replace("{n}", "12") },
	];
	const businessItems = [
		{ key: "active", label: strings.business.ordersTabActive },
		{ key: "history", label: strings.business.ordersTabHistory },
	];
	for (const palette of [light, dark]) {
		colors = palette;
		for (const items of [customerItems, businessItems]) {
			for (const selected of items) {
				views = [];
				triggers = [];
				texts = [];
				const onChange = mock(() => {});
				const html = renderToStaticMarkup(
					items === businessItems
						? createElement(OrdersTabs, {
								tab: selected.key as "active" | "history",
								onChange,
							})
						: createElement(SegmentedTabs, {
								value: selected.key,
								items,
								onValueChange: onChange,
							}),
				);
				expect(nativeWeb.StyleSheet.flatten(views[0].style).width).toBe("100%");
				expect(
					nativeWeb.StyleSheet.flatten(
						views.find((view) => view.role === "tablist").style,
					),
				).toMatchObject({
					width: "100%",
					height: "auto",
					marginRight: 0,
					flexDirection: "row",
					borderRadius: radii.md,
					padding: spacing.xs,
					gap: spacing.xs,
					backgroundColor: palette.muted,
				});
				expect(triggers).toHaveLength(2);
				for (const [index, trigger] of triggers.entries()) {
					const item = items[index];
					const active = item.key === selected.key;
					expect(html).toContain(item.label);
					expect(trigger.role).toBe("tab");
					expect(trigger.accessibilityState.selected).toBe(active);
					expect(nativeWeb.StyleSheet.flatten(trigger.style)).toMatchObject({
						flex: 1,
						height: "auto",
						paddingTop: 9,
						paddingBottom: 9,
						paddingLeft: 0,
						paddingRight: 0,
						borderRadius: radii.sm,
						borderWidth: 0,
						boxShadow: "none",
						backgroundColor: active
							? withAlpha(palette.primary, 0.14)
							: "transparent",
					});
					expect(
						nativeWeb.StyleSheet.flatten(texts[index].style),
					).toMatchObject({
						fontFamily: active ? fonts.bodyBold : fonts.bodySemiBold,
						fontSize: typography.bodySmall.fontSize,
						color: active ? palette.primary : palette.mutedForeground,
					});
					trigger.onPress({});
					expect(onChange).toHaveBeenLastCalledWith(item.key);
				}
				expect(onChange).toHaveBeenCalledTimes(2);
			}
		}
	}
});
