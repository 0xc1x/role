import { expect, mock, test } from "bun:test";
import * as React from "react";
import type { ReactNode } from "react";
// @ts-expect-error react-dom has no declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web has no declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import { validateBusinessSignupForm } from "@/src/features/auth/domain/validation";

// The business-owner funnel is the highest-value signup in the product and the
// only form with no inline validation: one generic line at the top, no email
// check, no password floor, and a submit button that was always enabled.

type FieldProps = Record<string, any>;

let fields: FieldProps[] = [];
let button: { disabled?: boolean; onPress?: () => Promise<void> | void };
let setFieldErrors: ((value: unknown) => void) | null = null;

const wrapper = ({ children }: { children?: ReactNode }) =>
	React.createElement(nativeWeb.View, null, children);

mockNativeUi();

mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("expo-router", () => ({
	Link: wrapper,
	router: { replace: () => {} },
	useRouter: () => ({ replace: () => {} }),
}));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	Screen: wrapper,
	TextField: (props: FieldProps) => {
		fields.push(props);
		return null;
	},
}));
mock.module("@/components/ui/button", () => ({
	Button: (props: FieldProps) => {
		button = props;
		return null;
	},
}));
mock.module("@/components/ui/text", () => ({ Text: nativeWeb.Text }));
const submitBusinessOwnerOnboarding = mock(
	async (_input: Record<string, unknown>) => ({
		status: "confirmation_required" as const,
	}),
);
mock.module("@/src/features/business/data/onboarding", () => ({
	submitBusinessOwnerOnboarding,
}));

// The six text states are the form fields, in order; the object state is the
// per-field error record.
let values: string[] = [];
let errors: unknown = null;
// Aliased away from the `use*` prefix: this is the real hook captured so the
// mocked `useState` below can delegate to it, not a hook call site.
const realUseState = React.useState;
mock.module("react", () => ({
	...React,
	useState: (initial: unknown) => {
		if (typeof initial === "string") {
			const value = values.shift() ?? initial;
			return [value, () => {}];
		}
		if (
			typeof initial === "object" &&
			initial !== null &&
			"nameError" in initial
		) {
			setFieldErrors = (next) => {
				errors = next;
			};
			return [errors ?? initial, setFieldErrors];
		}
		return realUseState(initial);
	},
}));

const { default: BusinessSignupScreen } = await import(
	"../../../../app/(auth)/business-signup"
);

const VALID = [
	"Ana Torres",
	"ana@panaderia.com",
	"12345678",
	"12345678",
	"Panadería Ana",
	"+593 99 000 0000",
];
const EMPTY = ["", "", "", "", "", ""];

function render(valuesToFill: string[], fieldErrors: unknown = null) {
	fields = [];
	button = undefined as never;
	values = [...valuesToFill];
	errors = fieldErrors;
	setFieldErrors = null;
	renderToStaticMarkup(React.createElement(BusinessSignupScreen));
}

const errorFor = (label: string) =>
	fields.find((f) => f.label === label)?.error ?? null;

test("submit stays disabled until every field is valid", () => {
	render(EMPTY);
	expect(button?.disabled).toBe(true);

	// Optional phone: a valid form with no phone still submits.
	render([...VALID.slice(0, 5), ""]);
	expect(button?.disabled).toBe(false);
});

test("submitting an empty form reports one error per field", async () => {
	render(EMPTY);
	await button?.onPress?.();

	expect(errors).toEqual(
		validateBusinessSignupForm({
			fullName: "",
			email: "",
			password: "",
			confirmPassword: "",
			businessName: "",
		}),
	);
	// The generic catch-all is gone: nothing to misread as a server failure.
	expect(submitBusinessOwnerOnboarding).not.toHaveBeenCalled();
});

test("a malformed email and a short password are named on their own fields", () => {
	const filled = [
		"Ana Torres",
		"ana[at]panaderia.com",
		"1234567",
		"12345678",
		"Panadería Ana",
		"",
	];
	const fieldErrors = validateBusinessSignupForm({
		fullName: filled[0] as string,
		email: filled[1] as string,
		password: filled[2] as string,
		confirmPassword: filled[3] as string,
		businessName: filled[4] as string,
	});
	render(filled, fieldErrors);

	expect(errorFor(strings.auth.email)).toBe(strings.auth.invalidEmail);
	expect(errorFor(strings.auth.password)).toBe(strings.auth.passwordMinError);
	expect(errorFor(strings.auth.fullName)).toBeNull();
	expect(button?.disabled).toBe(true);
});

test("mismatched passwords are reported on the confirmation field", () => {
	const filled = [
		"Ana Torres",
		"ana@panaderia.com",
		"12345678",
		"87654321",
		"Panadería Ana",
		"",
	];
	render(
		filled,
		validateBusinessSignupForm({
			fullName: filled[0] as string,
			email: filled[1] as string,
			password: filled[2] as string,
			confirmPassword: filled[3] as string,
			businessName: filled[4] as string,
		}),
	);

	expect(errorFor(strings.auth.confirmPassword)).toBe(
		strings.auth.passwordsMismatch,
	);
	expect(button?.disabled).toBe(true);
});

test("a valid form reaches the onboarding call with trimmed values", async () => {
	render(VALID);
	await button?.onPress?.();

	expect(submitBusinessOwnerOnboarding).toHaveBeenCalledTimes(1);
	expect(submitBusinessOwnerOnboarding.mock.calls[0]?.[0]).toMatchObject({
		fullName: "Ana Torres",
		email: "ana@panaderia.com",
		businessName: "Panadería Ana",
	});
});
