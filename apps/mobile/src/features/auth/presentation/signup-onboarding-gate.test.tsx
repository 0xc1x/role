import { expect, mock, test } from "bun:test";
import * as React from "react";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom has no declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

/**
 * M18: un consumidor que se registra nunca volvía a pasar por el gate de
 * onboarding. Signup saltaba directo a `/(consumer)`, así que la marca vista
 * de invitado y la de la cuenta (claves distintas por `profile.id`) dejaban al
 * cliente nuevo sin onboarding para siempre.
 *
 * El contrato que se fija aquí: signup publica el perfil en el store ANTES de
 * navegar y navega a "/" (el gate), no a un destino fijo.
 */

const navigations: string[] = [];
const publishedProfiles: unknown[] = [];
const toastErrors: string[] = [];

let signupResult: {
	requiresEmailConfirmation: boolean;
	profile: { id: string; role: string } | null;
} = {
	requiresEmailConfirmation: false,
	profile: { id: "consumer-1", role: "user" },
};

// Texto precargado y los dos checkboxes aceptados: este spec no prueba el
// formulario, prueba el destino de la navegación. El contador distingue los
// dos `useState(false)` de los checkboxes (términos + analítica) del
// `useState(false)` de `loading`, que debe quedarse en false para que la
// guarda de reentrada no bloquee el envío.
let checkboxFalseSeen = 0;
// Aliased away from the `use*` prefix: this is the real hook captured so the
// mocked `useState` below can delegate to it, not a hook call site.
const realUseState = React.useState;
mock.module("react", () => ({
	...React,
	useState: (initial: unknown) => {
		if (initial === "") return realUseState("ada@example.invalid");
		if (initial === false && checkboxFalseSeen < 2) {
			checkboxFalseSeen += 1;
			return realUseState(true);
		}
		return realUseState(initial);
	},
}));

let submit: () => Promise<void>;
mock.module("react-native", () => ({ ...nativeWeb }));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", async () => {
	const colors = await import("@/src/core/theme/colors");
	return { useTheme: () => ({ colors: colors.light }) };
});
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	TextField: (props: { onSubmitEditing?: () => Promise<void> }) => {
		if (props.onSubmitEditing) submit = props.onSubmitEditing;
		return null;
	},
}));
mock.module("@/components/ui/button", () => ({
	// Markup is irrelevant here: a bare string child would blow up inside a
	// react-native-web View, so the button renders nothing.
	Button: () => null,
}));
mock.module("@/src/components/ui/text", () => ({ Text: nativeWeb.Text }));
mock.module("@/src/core/ui/Logo", () => ({ Logo: () => null }));
mock.module("@/src/features/auth/presentation/AuthScreenShell", () => ({
	AuthScreenShell: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.View, null, children),
}));
mock.module("@/src/features/auth/presentation/SocialAuthButtons", () => ({
	SocialAuthButtons: () => null,
}));
mock.module("sonner-native", () => ({
	toast: {
		success: () => {},
		error: (message: string) => toastErrors.push(message),
	},
}));
mock.module("@/src/core/error/mapper", () => ({
	toAppError: () => ({ message: "fallo" }),
}));
mock.module("expo-router", () => ({
	useRouter: () => ({
		replace: (path: string) => navigations.push(path),
		push: () => {},
	}),
}));
mock.module("@/src/features/auth/store", () => ({
	useAuthStore: {
		getState: () => ({
			setProfile: (profile: unknown) => publishedProfiles.push(profile),
		}),
	},
}));
mock.module("@/src/features/auth/data/repository", () => ({
	authRepository: {
		signUpWithEmail: () => Promise.resolve(signupResult),
	},
}));

const { default: SignupScreen } = await import("../../../../app/(auth)/signup");

function runSignup() {
	navigations.length = 0;
	publishedProfiles.length = 0;
	toastErrors.length = 0;
	checkboxFalseSeen = 0;
	renderToStaticMarkup(createElement(SignupScreen));
	return submit();
}

test("a confirmed signup publishes the profile and hands over to the onboarding gate", async () => {
	signupResult = {
		requiresEmailConfirmation: false,
		profile: { id: "consumer-1", role: "user" },
	};

	await runSignup();

	// The gate reads the store to resolve the role and the per-account "seen"
	// mark; without this write it would still see a guest.
	expect(publishedProfiles).toEqual([{ id: "consumer-1", role: "user" }]);
	// "/" is the startup gate, not a hardcoded home.
	expect(navigations).toEqual(["/"]);
	expect(navigations).not.toContain("/(consumer)");
	expect(toastErrors).toEqual([]);
});

test("a business-role signup goes through the same gate, not a business path", async () => {
	signupResult = {
		requiresEmailConfirmation: false,
		profile: { id: "owner-1", role: "business" },
	};

	await runSignup();

	// Role routing belongs to app/index.tsx; signup must not duplicate it.
	expect(publishedProfiles).toEqual([{ id: "owner-1", role: "business" }]);
	expect(navigations).toEqual(["/"]);
});

test("a signup awaiting email confirmation still goes to login, without the gate", async () => {
	signupResult = { requiresEmailConfirmation: true, profile: null };

	await runSignup();

	expect(navigations).toEqual(["/login"]);
	expect(publishedProfiles).toEqual([]);
});
