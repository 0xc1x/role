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
};
const renderedButtons: ButtonCapture[] = [];
const events: string[] = [];

mock.module("react-native", () => nativeWeb);
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));
mock.module("@/src/core/ui", () => ({ AppText: nativeWeb.Text }));
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
	(_provider: string) =>
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

const render = (label: string): string => {
	renderedButtons.length = 0;
	return renderToStaticMarkup(React.createElement(SocialAuthButtons, { label }));
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
});

test("success sets the profile and navigates by role", async () => {
	render(strings.auth.orContinueWith);

	const googlePress = byLabel(strings.auth.google).onPress;
	if (!googlePress) throw new Error("google onPress missing");
	const pendingGoogle = googlePress();
	settle({ role: "user" });
	await pendingGoogle;
	expect(signIn.mock.calls.at(-1)).toEqual(["google"]);
	expect(events.splice(0)).toEqual(["profile", "/(consumer)"]);

	const applePress = byLabel(strings.auth.apple).onPress;
	if (!applePress) throw new Error("apple onPress missing");
	const pendingApple = applePress();
	settle({ role: "business" });
	await pendingApple;
	expect(signIn.mock.calls.at(-1)).toEqual(["apple"]);
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
