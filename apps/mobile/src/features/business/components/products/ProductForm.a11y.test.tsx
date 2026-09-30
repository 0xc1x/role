import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";

// ProductForm is the only place a business picks a required category set, an
// image and a pickup location. All three were unnamed buttons / untyped chips,
// so the selections were conveyed by background colour and font weight alone.

// The probe records the a11y surface each Pressable actually receives; these
// are the only fields the assertions below read.
type PressableProps = {
	accessibilityRole?: string;
	accessibilityLabel?: string;
	accessibilityState?: { checked?: boolean };
	onPress?: () => void;
	children?: ReactNode;
};

let received: PressableProps[] = [];

const ProbePressable = (props: PressableProps) => {
	received.push(props);
	return createElement(nativeWeb.View, null, props.children);
};

mock.module("react-native", () => ({
	...nativeWeb,
	Pressable: ProbePressable,
}));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("expo-image", () => ({ Image: nativeWeb.View }));
mock.module("expo-image-picker", () => ({
	launchImageLibraryAsync: async () => ({ canceled: true }),
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
}));
mock.module("@/src/features/hooks", () => ({
	useCategories: () => ({
		data: [
			{ id: "cat-panaderia", name: "Panadería", emoji: "🥐" },
			{ id: "cat-cafe", name: "Café", emoji: null },
		],
	}),
}));
mock.module("@/src/features/business/hooks", () => ({
	useBusinessLocations: () => ({
		data: [
			{
				id: "loc-1",
				name: "Centro",
				address: "Main 1",
				latitude: 0,
				longitude: 0,
			},
		],
	}),
	useSaveOffer: () => ({ mutate: () => {}, isPending: false }),
}));
const { AppText } = await import("@/src/core/ui/AppText");
mock.module("@/src/core/ui", () => ({
	AppText,
	BottomSheetModal: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.View, null, children),
	goBackOr: () => {},
	TextField: () => null,
}));
mock.module("@/components/ui/button", () => ({ Button: () => null }));
mock.module("./DateTimeFields", () => ({ DateTimeField: () => null }));
mock.module("../../utils/pick-image", () => ({
	pickWebImage: async () => null,
}));

const { ProductForm } = await import("./ProductForm");

// The location sheet only renders behind a boolean state, so force boolean
// useState initializers to true (same trick as the interop spec).
const React = await import("react");
const originalUseState = React.useState;
mock.module("react", () => ({
	...React,
	useState: (initial: unknown) =>
		originalUseState(typeof initial === "boolean" ? true : initial),
}));

function renderForm(product?: unknown) {
	received = [];
	renderToStaticMarkup(
		createElement(ProductForm, { businessId: "b-1", product } as never),
	);
	return received;
}

const imageAreaOf = (pressables: PressableProps[]) =>
	pressables.find(
		(p) => p.accessibilityRole === "button" && p.onPress !== undefined,
	);

test("the image picker stays a named button once a photo is chosen", () => {
	// Empty state: the placeholder text happens to name the action.
	expect(imageAreaOf(renderForm())?.accessibilityLabel).toBe(
		strings.business.uploadPhoto,
	);

	// With a photo the Pressable's only child is the <Image>, which
	// contributes no name at all — the prop is the whole accessible name.
	const filled = renderForm({
		offer: {
			id: "offer-1",
			business_location_id: "loc-1",
			image: "https://example.invalid/photo.jpg",
			title: "Mañana",
			original_price: 10,
			discounted_price: 4,
			stock: 5,
			initial_stock: 5,
			pickup_start: "2026-09-06T15:00:00",
			pickup_end: "2026-09-06T18:00:00",
			is_active: true,
		},
		categories: [{ id: "cat-cafe" }],
	});
	expect(imageAreaOf(filled)?.accessibilityLabel).toBe(
		strings.business.changePhoto,
	);

	// And the required category selection is no longer implicit.
	const checked = filled
		.filter((p) => p.accessibilityRole === "checkbox")
		.map((p) => p.accessibilityState);
	expect(checked).toEqual([{ checked: false }, { checked: true }]);
});

test("category chips are checkboxes that report which ones are selected", () => {
	const chips = renderForm().filter((p) => p.accessibilityRole === "checkbox");

	expect(chips.map((chip) => chip.accessibilityLabel)).toEqual([
		"Panadería",
		"Café",
	]);
	// No category is pre-selected in create mode; every chip reports unchecked
	// rather than leaving the state implicit.
	for (const chip of chips) {
		expect(chip.accessibilityState).toEqual({ checked: false });
	}
});

test("the location select announces its group and current value", () => {
	const select = renderForm().find(
		(p) =>
			p.accessibilityRole === "button" &&
			typeof p.accessibilityLabel === "string" &&
			p.accessibilityLabel.startsWith(strings.business.locations),
	);

	expect(select).toBeDefined();
	expect(select?.accessibilityLabel).toBe(
		`${strings.business.locations}: ${strings.business.noLocationOption}`,
	);
});

test("location options are a radio group with exactly one checked", () => {
	const options = renderForm().filter((p) => p.accessibilityRole === "radio");

	expect(options.map((option) => option.accessibilityLabel)).toEqual([
		strings.business.noLocationOption,
		"Centro",
	]);
	expect(options.map((option) => option.accessibilityState)).toEqual([
		{ checked: true },
		{ checked: false },
	]);
});
