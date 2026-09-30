import { expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom has no declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import { strings } from "@/src/core/i18n/strings";

/**
 * M17: dos controles que parecen vivos y no hacen nada son un defecto, no un
 * placeholder. Este spec fija el contrato: la pieza ya NO renderiza botones,
 * y lo que renderiza se anuncia como no disponible.
 */

// Los Buttons se recogen para poder distinguir "botón deshabilitado" de "nota".
const renderedButtons: Array<{ label?: string; disabled?: boolean }> = [];
const Pressable = (props: {
	children?: ReactNode;
	accessibilityRole?: string;
	onPress?: () => void;
}) => {
	if (
		props.accessibilityRole === "button" ||
		props.accessibilityRole === "link"
	) {
		renderedButtons.push({ label: props.accessibilityRole });
	}
	return createElement(nativeWeb.View, null, props.children);
};

mock.module("react-native", () => ({ ...nativeWeb, Pressable }));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("expo-router", () => ({ router: { back: () => {} } }));
mock.module("@/src/core/theme", async () => {
	const actual = await import("@/src/core/theme/colors");
	return { useTheme: () => ({ colors: actual.light }) };
});
mock.module("@/src/core/ui", () => ({ AppText: nativeWeb.Text }));
mock.module("@/components/ui/button", () => ({
	Button: (props: {
		children?: ReactNode;
		disabled?: boolean;
		accessibilityLabel?: string;
		onPress?: () => void;
	}) => {
		renderedButtons.push({
			label: props.accessibilityLabel,
			disabled: props.disabled,
		});
		return createElement(nativeWeb.View, null, props.children);
	},
}));

const { SocialAuthButtons } = await import("./SocialAuthButtons");

test("the social block renders no button, only an honest unavailable notice", () => {
	renderedButtons.length = 0;
	const html = renderToStaticMarkup(
		createElement(SocialAuthButtons, { label: strings.auth.orContinueWith }),
	);

	// No interactive control at all: nothing to tap, nothing to pretend.
	expect(renderedButtons).toEqual([]);

	// The providers are still named, so the absence reads as "not yet", not
	// as "Rolé dropped social login".
	expect(html).toContain(strings.auth.google);
	expect(html).toContain(strings.auth.apple);
	expect(html).toContain(strings.auth.socialUnavailableLabel);
	expect(html).toContain(strings.auth.socialUnavailableBody);

	// The divider copy the auth screens pass in survives.
	expect(html).toContain(strings.auth.orContinueWith);
});

test("the notice never uses the interactive-button role", () => {
	renderedButtons.length = 0;
	const html = renderToStaticMarkup(
		createElement(SocialAuthButtons, { label: strings.auth.orSignupWith }),
	);

	expect(renderedButtons).toEqual([]);
	expect(html).not.toContain('role="button"');
	expect(html).not.toContain("disabled");
});
