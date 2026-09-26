import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { dark, light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

// Five anonymous buttons: a blind user could not tell what they were rating or
// which one was picked, and the pick itself was carried by colour alone.

type ViewProps = ComponentProps<typeof nativeWeb.View>;
type PressableProps = ComponentProps<typeof nativeWeb.Pressable>;
let views: ViewProps[] = [];
let stars: PressableProps[] = [];

mockNativeUi({
	View: (props: ViewProps) => {
		views.push(props);
		return createElement(nativeWeb.View, props);
	},
	Pressable: (props: PressableProps) => {
		stars.push(props);
		return createElement(nativeWeb.Pressable, props);
	},
});
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
	ThemeProvider: () => null,
	light,
	dark,
	colorTokens: { light, dark },
}));

const { StarRating } = await import("./StarRating");

const labelFor = (n: number) =>
	strings.orders.ratingValue.replace("{n}", String(n)).replace("{total}", "5");

beforeEach(() => {
	views = [];
	stars = [];
});

test("the five stars are a named radio group with one checked option", () => {
	for (const value of [1, 3, 5]) {
		views = [];
		stars = [];
		renderToStaticMarkup(
			createElement(StarRating, {
				label: strings.orders.rateProduct,
				value,
				onChange: () => {},
			}),
		);

		const group = views.find((view) => view.accessibilityRole === "radiogroup");
		expect(group?.accessibilityLabel).toBe(strings.orders.rateProduct);

		expect(stars).toHaveLength(5);
		for (const [index, star] of stars.entries()) {
			expect(star.accessibilityRole).toBe("radio");
			expect(star.accessibilityLabel).toBe(labelFor(index + 1));
			expect(star.accessibilityState).toEqual({ checked: index + 1 === value });
		}
		expect(
			stars.filter((star) => star.accessibilityState?.checked),
		).toHaveLength(1);
	}
});

test("pressing a star reports that star's value", () => {
	const onChange = mock(() => {});
	renderToStaticMarkup(
		createElement(StarRating, {
			label: strings.orders.rateBusiness,
			value: 5,
			onChange,
		}),
	);

	for (const [index, star] of stars.entries()) {
		star.onPress?.({} as never);
		expect(onChange).toHaveBeenLastCalledWith(index + 1);
	}
	expect(onChange).toHaveBeenCalledTimes(5);
});
