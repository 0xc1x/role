import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ComponentProps } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { Mail } from "lucide-react-native";
import { dark, light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

// The label used to be a sibling <Text> that the input never referenced, so
// focusing a field announced only its value or placeholder. Every form in the
// app (auth, business profile, product, address, review) renders this one
// component, so the association is asserted here once, for both branches.

type ProbeProps = ComponentProps<typeof nativeWeb.TextInput>;
let inputs: ProbeProps[] = [];

const ProbeTextInput = (props: ProbeProps) => {
	inputs.push(props);
	return createElement(nativeWeb.TextInput, props);
};

mockNativeUi({ TextInput: ProbeTextInput });
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
// The barrel also re-exports BottomSheetModal, whose portal primitive ships
// JSX inside .mjs (Metro handles that; bun does not). Not under test here.
mock.module("@/src/core/ui/BottomSheetModal", () => ({
	BottomSheetModal: () => null,
}));
mock.module("expo-router", () => ({
	router: { push: () => {}, replace: () => {}, back: () => {} },
	useNavigation: () => ({ setOptions: () => {} }),
	useSegments: () => [],
}));
// The real theme module pulls expo-modules-core, which needs `globalThis.expo`.
// Re-export the rest of its surface so sibling specs importing `light`/`dark`
// from here are not starved by this replacement.
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
	ThemeProvider: () => null,
	light,
	dark,
	colorTokens: { light, dark },
}));

const { TextField } = await import("@/src/core/ui");

beforeEach(() => {
	inputs = [];
});

test("the plain branch announces the label as the input's accessibility label", () => {
	const html = renderToStaticMarkup(
		createElement(TextField, {
			label: strings.auth.email,
			value: "hola@role.invalid",
		}),
	);

	expect(inputs).toHaveLength(1);
	expect(inputs[0]?.accessibilityLabel).toBe(strings.auth.email);
	// The web build only exposes it if RN mapped it to `aria-label`.
	expect(html).toContain(`aria-label="${strings.auth.email}"`);
});

test("the icon + secureToggle branch announces the label too", () => {
	renderToStaticMarkup(
		createElement(TextField, {
			label: strings.auth.password,
			icon: Mail,
			secureTextEntry: true,
		}),
	);

	expect(inputs).toHaveLength(1);
	expect(inputs[0]?.accessibilityLabel).toBe(strings.auth.password);
	expect(inputs[0]?.secureTextEntry).toBe(true);
});

test("an explicit caller label wins over the visible one", () => {
	renderToStaticMarkup(
		createElement(TextField, {
			label: strings.auth.email,
			accessibilityLabel: strings.auth.login,
		}),
	);

	expect(inputs[0]?.accessibilityLabel).toBe(strings.auth.login);
});

test("an unlabelled field is not given a synthetic name", () => {
	renderToStaticMarkup(
		createElement(TextField, { placeholder: strings.common.search }),
	);

	expect(inputs[0]?.accessibilityLabel).toBeUndefined();
});
