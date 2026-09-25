import { expect, mock, test } from "bun:test";
import { createElement } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web provides the renderer without declarations.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";

// ProductForm imports expo modules transitively; bun:test runs without the
// Expo global shims, so define the one the imported modules touch.
// @ts-expect-error test-only global shim
globalThis.__DEV__ ??= false;

// Pressable probe records what each rendered Pressable actually receives at
// the React boundary, so assertions cover selection and pressed styles.
let received: Array<Record<string, unknown>> = [];
const ProbePressable = (props: any) => {
	const style =
		typeof props.style === "function"
			? props.style({ pressed: true })
			: props.style;
	received.push({
		cssInterop: props.cssInterop,
		callback: typeof props.style === "function",
		style: nativeWeb.StyleSheet.flatten(style) ?? {},
	});
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
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));
mock.module("@/src/features/hooks", () => ({
	useCategories: () => ({ data: [] }),
}));
mock.module("@/src/features/business/hooks", () => ({
	useBusinessLocations: () => ({
		data: [
			{
				id: "loc-1",
				name: "Downtown",
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
	BottomSheetModal: ({ children }: any) =>
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

// The location sheet only renders when its boolean state is true, so force
// boolean useState initializers to true, opening the sheet, same as the
// pre-edit diagnostic.
const React = await import("react");
const originalUseState = React.useState;
mock.module("react", () => ({
	...React,
	useState: (initial: any) =>
		originalUseState(typeof initial === "boolean" ? true : initial),
}));

test("all location-sheet Pressables keep callback styles with the interop opt-out", () => {
	renderToStaticMarkup(createElement(ProductForm, { businessId: "b-1" }));
	const sheetRows = received.filter((p) => p.callback);
	// image area + select row + the two location rows inside the opened sheet.
	expect(sheetRows.length).toBe(4);
	expect(sheetRows.every((p) => p.cssInterop === false)).toBe(true);
	expect(
		sheetRows.every((p) => Object.keys(p.style as object).length > 0),
	).toBe(true);
});
