import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

// The product form picks a required category set and a pickup branch from two
// queries. Both were rendered as `(data ?? []).map(...)`: when the query failed
// the owner saw an empty chip row (or an empty sheet) under a required label —
// blocked, with no cause and no retry.

// The probe records what each Pressable receives; the assertions read the
// accessibility surface only.
type PressableProps = {
	accessibilityRole?: string;
	accessibilityLabel?: string;
	onPress?: () => void;
	children?: ReactNode;
};

let received: PressableProps[] = [];

const ProbePressable = (props: PressableProps) => {
	received.push(props);
	return createElement(nativeWeb.View, null, props.children);
};

mockNativeUi({ Pressable: ProbePressable });

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

type Query<T> = {
	data?: T;
	isPending?: boolean;
	isError?: boolean;
	error?: unknown;
	refetch?: () => Promise<unknown>;
};

let categories: Query<
	Array<{ id: string; name: string; emoji: string | null }>
>;
let locations: Query<
	Array<{ id: string; name: string; address: string | null }>
>;
let refetchCalls = 0;
const refetch = () => {
	refetchCalls += 1;
	return Promise.resolve();
};

mock.module("@/src/features/hooks", () => ({
	useCategories: () => categories,
}));
mock.module("@/src/features/business/hooks", () => ({
	useBusinessLocations: () => locations,
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
// useState initializers to true (same trick as the a11y/interop specs).
const React = await import("react");
const originalUseState = React.useState;
mock.module("react", () => ({
	...React,
	useState: (initial: unknown) =>
		originalUseState(typeof initial === "boolean" ? true : initial),
}));

function renderForm() {
	received = [];
	refetchCalls = 0;
	return renderToStaticMarkup(
		createElement(ProductForm, { businessId: "b-1" } as never),
	);
}

const chips = () =>
	received.filter((p) => p.accessibilityRole === "checkbox").length;
const retryButton = () =>
	received.find((p) => p.accessibilityLabel === strings.common.retry);
const hasRadio = (name: string) =>
	received.some((p) => p.accessibilityLabel === name);

const OK_LOCATIONS = [{ id: "loc-1", name: "Centro", address: "Main 1" }];

test("a failed categories query renders an error with retry, not an empty chip row", () => {
	categories = { isError: true, error: new Error("network down"), refetch };
	locations = { data: OK_LOCATIONS };

	const html = renderForm();

	expect(html).toContain(strings.business.categoriesLoadError);
	// The label is still there, but the required field is not a blank row.
	expect(html).toContain(strings.business.productCategories);
	expect(chips()).toBe(0);
	expect(retryButton()).toBeDefined();

	retryButton()?.onPress?.();
	expect(refetchCalls).toBe(1);
});

test("a genuinely empty categories result renders an empty state, not a failure", () => {
	categories = { data: [], isPending: false, isError: false };
	locations = { data: OK_LOCATIONS };

	const html = renderForm();

	expect(html).toContain(strings.business.noCategoriesTitle);
	expect(html).toContain(strings.business.noCategoriesBody);
	expect(html).not.toContain(strings.business.categoriesLoadError);
	expect(retryButton()).toBeUndefined();
	expect(chips()).toBe(0);
});

test("a pending categories query says so instead of showing nothing", () => {
	categories = { isPending: true };
	locations = { data: OK_LOCATIONS };

	const html = renderForm();

	expect(html).toContain(strings.common.loading);
	expect(chips()).toBe(0);
});

test("loaded categories still render their chips", () => {
	categories = {
		data: [
			{ id: "cat-1", name: "Panadería", emoji: "🥐" },
			{ id: "cat-2", name: "Café", emoji: null },
		],
		isPending: false,
		isError: false,
	};
	locations = { data: OK_LOCATIONS };

	const html = renderForm();

	expect(chips()).toBe(2);
	expect(html).not.toContain(strings.business.categoriesLoadError);
	expect(html).not.toContain(strings.business.noCategoriesTitle);
});

test("a failed locations query renders an error with retry in the picker", () => {
	categories = { data: [], isPending: false, isError: false };
	locations = { isError: true, error: new Error("network down"), refetch };

	const html = renderForm();

	expect(html).toContain(strings.business.locationsLoadError);
	expect(hasRadio("Centro")).toBe(false);
	// "Sin sucursal" is a real option and stays available.
	expect(hasRadio(strings.business.noLocationOption)).toBe(true);

	retryButton()?.onPress?.();
	expect(refetchCalls).toBe(1);
});

test("a business with no locations explains what the empty picker means", () => {
	categories = { data: [], isPending: false, isError: false };
	locations = { data: [], isPending: false, isError: false };

	const html = renderForm();

	expect(html).toContain(strings.business.locationsPickerEmptyBody);
	expect(html).not.toContain(strings.business.locationsLoadError);
});
