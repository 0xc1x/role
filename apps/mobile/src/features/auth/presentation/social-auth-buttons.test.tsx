import { expect, mock, test } from "bun:test";
import * as React from "react";
// @ts-expect-error react-dom has no declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";

/**
 * M18: the social block renders two live provider buttons over the hosted
 * OAuth flow (Flow A). This spec pins the new contract: enabled buttons per
 * provider, dismissal is a silent no-op, failures release the guard without
 * navigating, and the old "unavailable" notice is gone.
 */

type ButtonCapture = {
	accessibilityLabel?: string;
	disabled?: boolean;
	loading?: boolean;
	onPress?: () => Promise<void>;
	children?: React.ReactNode;
	icon?: React.ReactElement<{ name?: string }>;
};
const renderedButtons: ButtonCapture[] = [];
const events: string[] = [];

mock.module("react-native", () => nativeWeb);
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));
mock.module("@/src/core/ui", () => ({ AppText: nativeWeb.Text }));
mock.module("@expo/vector-icons", () => ({
	Ionicons: (props: { name?: string }) =>
		React.createElement(nativeWeb.Text, null, props.name),
}));
mock.module("@/components/ui/button", () => ({
	Button: (props: ButtonCapture) => {
		renderedButtons.push(props);
		return React.createElement(nativeWeb.View, null, props.children);
	},
}));
mock.module("@/src/core/error/mapper", () => ({
	toAppError: () => ({ message: "Social failed" }),
}));
mock.module("@/src/features/auth/store", () => ({
	useAuthStore: {
		getState: () => ({ setProfile: () => events.push("profile") }),
	},
}));
mock.module("expo-router", () => ({
	router: { replace: (path: string) => events.push(path) },
}));
mock.module("expo-web-browser", () => ({
	maybeCompleteAuthSession: () => {},
}));

let settle: (profile: { role: string } | null) => void;
let reject: (error: Error) => void;
const signIn = mock(
	(_provider: string, _options?: { forceAccountPicker?: boolean }) =>
		new Promise<{ role: string } | null>((resolve, fail) => {
			settle = resolve;
			reject = fail;
		}),
);
mock.module("@/src/features/auth/data/social-oauth", () => ({
	signInWithProvider: signIn,
}));

const { SocialAuthButtons } = await import("./SocialAuthButtons");

const byLabel = (label: string): ButtonCapture => {
	const found = renderedButtons.find((b) => b.accessibilityLabel === label);
	if (!found) throw new Error(`button not rendered: ${label}`);
	return found;
};

const render = (
	label: string,
	{ disabled = false, forceAccountPicker = false } = {},
): string => {
	renderedButtons.length = 0;
	return renderToStaticMarkup(
		React.createElement(SocialAuthButtons, {
			label,
			disabled,
			forceAccountPicker,
		}),
	);
};

test("renders two enabled provider buttons and no unavailable notice", () => {
	const html = render(strings.auth.orContinueWith);

	expect(html).toContain(strings.auth.orContinueWith);
	expect(html).toContain(strings.auth.google);
	expect(html).toContain(strings.auth.apple);
	expect(html).not.toContain("Próximamente");

	const google = byLabel(strings.auth.google);
	const apple = byLabel(strings.auth.apple);
	expect(google.disabled).toBe(false);
	expect(google.loading).toBe(false);
	expect(apple.disabled).toBe(false);
	expect(apple.loading).toBe(false);

	// Brand glyphs, not generic icons: each button carries its provider logo.
	expect(google.icon?.props.name).toBe("logo-google");
	expect(apple.icon?.props.name).toBe("logo-apple");
});

test("a disabled block never reaches the repository (signup terms gate)", async () => {
	render(strings.auth.orSignupWith, { disabled: true });

	const google = byLabel(strings.auth.google);
	const apple = byLabel(strings.auth.apple);
	expect(google.disabled).toBe(true);
	expect(apple.disabled).toBe(true);

	const pressGoogle = google.onPress;
	if (!pressGoogle) throw new Error("google onPress missing");
	const pressApple = apple.onPress;
	if (!pressApple) throw new Error("apple onPress missing");

	// The buttons read as disabled, and a press still cannot slip past the
	// gate: no sign-in call, no profile write, no navigation.
	const before = signIn.mock.calls.length;
	await pressGoogle();
	await pressApple();
	expect(signIn.mock.calls.length).toBe(before);
	expect(events.splice(0)).toEqual([]);
});

test("signup asks the provider which account to use; login does not", async () => {
	// The auth sheet reuses the system cookie jar, so without `prompt` the
	// provider silently re-authenticates the account already signed in and
	// the chooser never appears.
	render(strings.auth.orSignupWith, { forceAccountPicker: true });
	const press = byLabel(strings.auth.google).onPress;
	if (!press) throw new Error("google onPress missing");
	const pending = press();
	settle({ role: "user" });
	await pending;
	expect(signIn.mock.calls.at(-1)).toEqual([
		"google",
		{ forceAccountPicker: true },
	]);
	expect(events.splice(0)).toEqual(["profile", "/(consumer)"]);

	render(strings.auth.orContinueWith);
	const loginPress = byLabel(strings.auth.google).onPress;
	if (!loginPress) throw new Error("google onPress missing");
	const loginPending = loginPress();
	settle({ role: "user" });
	await loginPending;
	expect(signIn.mock.calls.at(-1)).toEqual([
		"google",
		{ forceAccountPicker: false },
	]);
	// Drain: the next test asserts the navigation log from empty.
	expect(events.splice(0)).toEqual(["profile", "/(consumer)"]);
});

test("success sets the profile and navigates by role", async () => {
	render(strings.auth.orContinueWith);

	const googlePress = byLabel(strings.auth.google).onPress;
	if (!googlePress) throw new Error("google onPress missing");
	const pendingGoogle = googlePress();
	settle({ role: "user" });
	await pendingGoogle;
	expect(signIn.mock.calls.at(-1)).toEqual([
		"google",
		{ forceAccountPicker: false },
	]);
	expect(events.splice(0)).toEqual(["profile", "/(consumer)"]);

	const applePress = byLabel(strings.auth.apple).onPress;
	if (!applePress) throw new Error("apple onPress missing");
	const pendingApple = applePress();
	settle({ role: "business" });
	await pendingApple;
	expect(signIn.mock.calls.at(-1)).toEqual([
		"apple",
		{ forceAccountPicker: false },
	]);
	expect(events.splice(0)).toEqual(["profile", "/(business)/products"]);
});

test("sheet dismissal is a silent no-op: no navigation, guard released", async () => {
	render(strings.auth.orSignupWith);

	const press = byLabel(strings.auth.google).onPress;
	if (!press) throw new Error("google onPress missing");
	const dismissed = press();
	settle(null);
	await dismissed;
	expect(events.splice(0)).toEqual([]);

	// Guard released: a retry reaches the repository again.
	const retry = press();
	settle({ role: "user" });
	await retry;
	expect(events.splice(0)).toEqual(["profile", "/(consumer)"]);
});

test("failure navigates nowhere and releases the guard for retry", async () => {
	render(strings.auth.orContinueWith);

	const press = byLabel(strings.auth.apple).onPress;
	if (!press) throw new Error("apple onPress missing");
	const before = signIn.mock.calls.length;
	const failed = press();
	reject(new Error("oauth exploded"));
	await failed;
	expect(signIn.mock.calls.length).toBe(before + 1);
	expect(events.splice(0)).toEqual([]);

	const retry = press();
	settle({ role: "user" });
	await retry;
	expect(events.splice(0)).toEqual(["profile", "/(consumer)"]);
});

test("a second press while pending is ignored", async () => {
	render(strings.auth.orContinueWith);

	const press = byLabel(strings.auth.google).onPress;
	if (!press) throw new Error("google onPress missing");
	const before = signIn.mock.calls.length;
	const first = press();
	const second = press();
	settle({ role: "user" });
	await first;
	await second;
	expect(signIn.mock.calls.length).toBe(before + 1);
	expect(events.splice(0)).toEqual(["profile", "/(consumer)"]);
});
