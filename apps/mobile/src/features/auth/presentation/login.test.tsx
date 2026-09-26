import { expect, mock, test } from "bun:test";
import * as React from "react";
// @ts-expect-error react-dom has no declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web has no declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";

let valid = true;
const useState = React.useState;
mock.module("react", () => ({
	...React,
	useState: (initial: unknown) =>
		useState(initial === "" && valid ? "test@example.invalid" : initial),
}));
let pressLogin: () => Promise<void>;
let submitPassword: () => Promise<void>;

/**
 * The Pressable probe duck-types into React element internals: it reads
 * `children.props.children` and scans that list. These two narrowers describe
 * that surface over `unknown`, so the probe needs neither `any` nor a cast and
 * the traversal itself is unchanged (a non-array child list yields no match,
 * exactly as the optional `?.some?.()` did).
 */
const propsOf = (node: unknown): unknown =>
	node && typeof node === "object" && "props" in node
		? (node as { props: unknown }).props
		: undefined;

const childrenOf = (node: unknown): unknown => {
	const props = propsOf(node);
	return props && typeof props === "object" && "children" in props
		? (props as { children: unknown }).children
		: undefined;
};

/** True when `node` renders `label` as one of its direct children. */
const rendersLabel = (node: unknown, label: string): boolean => {
	const siblings = childrenOf(node);
	return (
		Array.isArray(siblings) &&
		siblings.some((child) => childrenOf(child) === label)
	);
};

type PressableProbeProps = {
	children?: React.ReactNode;
	onPress?: () => Promise<void>;
};

type TextFieldProbeProps = {
	onSubmitEditing?: () => Promise<void>;
};

mock.module("react-native", () => ({
	...nativeWeb,
	Pressable: (props: PressableProbeProps) => {
		const { children, onPress } = props;
		if (onPress && rendersLabel(children, strings.auth.login)) {
			pressLogin = onPress;
		}
		return React.createElement(nativeWeb.View, null, children);
	},
}));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	TextField: (props: TextFieldProbeProps) => {
		if (props.onSubmitEditing) submitPassword = props.onSubmitEditing;
		return null;
	},
}));
mock.module("@/src/core/ui/Logo", () => ({ Logo: () => null }));
mock.module("./AuthScreenShell", () => ({ AuthScreenShell: nativeWeb.View }));
mock.module("./SocialAuthButtons", () => ({ SocialAuthButtons: () => null }));
mock.module("sonner-native", () => ({ toast: { success: () => {} } }));
mock.module("@/src/core/error/mapper", () => ({
	toAppError: () => ({ message: "Login failed" }),
}));
const events: string[] = [];
mock.module("expo-router", () => ({
	useRouter: () => ({ replace: (path: string) => events.push(path) }),
}));
mock.module("@/src/features/auth/store", () => ({
	useAuthStore: {
		getState: () => ({ setProfile: () => events.push("profile") }),
	},
}));
let settle: (profile: { role: string }) => void;
let reject: (error: Error) => void;
const signIn = mock(
	() =>
		new Promise<{ role: string }>((resolve, fail) => {
			settle = resolve;
			reject = fail;
		}),
);
mock.module("@/src/features/auth/data/repository", () => ({
	authRepository: { signInWithEmail: signIn },
}));
const { default: LoginScreen } = await import("../../../../app/(auth)/login");

test("login guards button and keyboard submissions, releases after success/failure, and validates first", async () => {
	valid = false;
	renderToStaticMarkup(React.createElement(LoginScreen));
	await submitPassword();
	expect(signIn).not.toHaveBeenCalled();

	valid = true;
	renderToStaticMarkup(React.createElement(LoginScreen));
	expect(pressLogin).toBe(submitPassword);
	for (const role of ["consumer", "business", "admin"]) {
		const before = signIn.mock.calls.length;
		const pending = pressLogin();
		await submitPassword();
		expect(signIn.mock.calls.length).toBe(before + 1);
		settle({ role });
		await pending;
		expect(events.splice(0)).toEqual([
			"profile",
			role === "consumer" ? "/(consumer)" : "/(business)/products",
		]);
	}
	const failed = submitPassword();
	reject(new Error("rejected"));
	await failed;
	const before = signIn.mock.calls.length;
	const retry = pressLogin();
	expect(signIn.mock.calls.length).toBe(before + 1);
	settle({ role: "consumer" });
	await retry;
});
