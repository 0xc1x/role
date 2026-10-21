import { beforeEach, expect, jest, mock, test } from "bun:test";
import * as React from "react";
// @ts-expect-error react-dom has no declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web has no declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { light } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";

/**
 * El login de los accesos de staff (§9.1): recuerda el identificador con el
 * que ya se entró, y el "¿olvidaste tu contraseña?" NO promete un correo que
 * no llega.
 *
 * ─── POR QUÉ EL ESTADO SOBREVIVE AL MONTAJE ──────────────────────────────────
 *
 * `renderToStaticMarkup` monta una instancia NUEVA en cada llamada, así que
 * lo que un toque escribe en el estado se perdería: nadie vuelve a leerlo.
 * El arnés de `useState` guarda los valores entre montajes, y el segundo
 * render ve lo que el toque dejó. Sin él, la aserción sobre el `autoFocus` del
 * PIN —que es lo que prueba que el foco cambió— no tendría objeto.
 */

const navigations: string[] = [];
const toasts: string[] = [];

const signInWithEmail = jest.fn(async () => ({
	id: "11111111-1111-4111-8111-111111111111",
	email: "ana@dominio.com",
	fullName: null,
	avatarUrl: null,
	phone: null,
	city: null,
	role: "user" as const,
	analyticsConsentGranted: false,
}));
const sendPasswordResetEmail = jest.fn(async () => {});
const rememberLoginIdentifier = jest.fn(async () => {});

/** Los identificadores que el dispositivo "recuerda" en cada escenario. */
let rememberedIdentifiers: string[] = [];

/**
 * El estado de React, indexado por llamada a `useState`. El índice lo decide
 * el orden de los hooks del componente, que es estable entre montajes.
 */
const stateValues: unknown[] = [];
let stateIndex = 0;
const realUseState = React.useState;

mock.module("react", () => ({
	...React,
	useState: (initial: unknown) => {
		const index = stateIndex++;
		if (!(index in stateValues)) {
			stateValues[index] =
				typeof initial === "function" ? (initial as () => unknown)() : initial;
		}
		const [, setValue] = realUseState(stateValues[index]);
		const set = (next: unknown) => {
			stateValues[index] =
				typeof next === "function"
					? (next as (previous: unknown) => unknown)(stateValues[index])
					: next;
			setValue(stateValues[index]);
		};
		return [stateValues[index], set];
	},
}));

/**
 * El texto que un nodo pinta. Los hijos del chip son un `AppText` (un
 * elemento), así que hay que bajar al `children` del elemento para leer el
 * identificador.
 */
const propsOf = (node: unknown): unknown =>
	node && typeof node === "object" && "props" in node
		? (node as { props: unknown }).props
		: undefined;

const textOf = (node: unknown): string => {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textOf).join("");
	const props = propsOf(node);
	if (props && typeof props === "object" && "children" in props) {
		return textOf((props as { children: unknown }).children);
	}
	return "";
};

interface TextFieldProbe {
	label?: string;
	value?: string;
	autoFocus?: boolean;
	autoComplete?: string;
	textContentType?: string;
	onChangeText?: (text: string) => void;
	onSubmitEditing?: () => Promise<void> | void;
}

interface PressableProbe {
	label: string;
	onPress?: () => void;
}

const textFields: TextFieldProbe[] = [];
const pressables: PressableProbe[] = [];

/**
 * La llave con la que se montó cada `TextField`.
 *
 * `TextField` no reenvía refs, así que el foco al PIN se pide **remontando** el
 * campo con una `key` nueva: un `autoFocus` sólo actúa al montar. Y la `key` no
 * llega a las props del componente —React la consume al crear el elemento—, así
 * que el arnés la lee del runtime de JSX, que es donde se crea. Sin esto, quitar
 * la `key` del campo del PIN no rompe ningún test y el foco deja de funcionar en
 * el dispositivo sin que nada lo note.
 */
const elementKeys: { label?: string; key: string | null }[] = [];

const TextFieldDouble = (props: TextFieldProbe) => {
	textFields.push(props);
	return null;
};

const jsxRuntime = await import("react/jsx-dev-runtime");
// La función original se guarda ANTES del doble: el doble reemplaza el
// binding del módulo, y llamarla a través del namespace se llama a sí misma.
const originalJsxDEV = jsxRuntime.jsxDEV;

const jsxDEV = (
	type: unknown,
	props: unknown,
	key?: unknown,
	...rest: unknown[]
) => {
	if (type === TextFieldDouble) {
		elementKeys.push({
			label: (props as { label?: string }).label,
			key: key === undefined ? null : String(key),
		});
	}
	return (originalJsxDEV as (...args: unknown[]) => unknown)(
		type,
		props,
		key,
		...rest,
	);
};

// Bun compila el JSX al runtime de DESARROLLO cuando `NODE_ENV` no es
// `production`; el de producción se doblea también, para que el arnés no
// dependa del modo en que se corran los tests.
mock.module("react/jsx-dev-runtime", () => ({
	...jsxRuntime,
	jsxDEV,
}));

const jsxProd = await import("react/jsx-runtime");
const originalJsx = jsxProd.jsx;
const originalJsxs = jsxProd.jsxs;

const conLlave = (
	original: (...args: unknown[]) => unknown,
): ((type: unknown, props: unknown, key?: unknown) => unknown) => {
	return (type, props, key) => {
		if (type === TextFieldDouble) {
			elementKeys.push({
				label: (props as { label?: string }).label,
				key: key === undefined ? null : String(key),
			});
		}
		return original(type, props, key);
	};
};

mock.module("react/jsx-runtime", () => ({
	...jsxProd,
	jsx: conLlave(originalJsx as (...args: unknown[]) => unknown),
	jsxs: conLlave(originalJsxs as (...args: unknown[]) => unknown),
}));

mock.module("react-native", () => ({
	...nativeWeb,
	Pressable: (props: { onPress?: () => void; children?: React.ReactNode }) => {
		pressables.push({ label: textOf(props.children), onPress: props.onPress });
		return React.createElement(nativeWeb.View, null, props.children);
	},
	// El `Modal` de react-native-web monta un portal, y el renderizador de
	// servidor no los soporta: el diálogo se ve en el markup directamente.
	Modal: (props: { children?: React.ReactNode }) =>
		React.createElement(nativeWeb.View, null, props.children),
}));
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));
mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	TextField: TextFieldDouble,
}));
mock.module("@/src/core/ui/Logo", () => ({ Logo: () => null }));
mock.module("@/src/features/auth/presentation/AuthScreenShell", () => ({
	AuthScreenShell: nativeWeb.View,
}));
mock.module("@/src/features/auth/presentation/SocialAuthButtons", () => ({
	SocialAuthButtons: () => null,
}));
mock.module("sonner-native", () => ({
	toast: { success: (message: string) => toasts.push(message) },
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
	useAuthStore: { getState: () => ({ setProfile: () => {} }) },
}));
mock.module("@/src/features/auth/data/repository", () => ({
	authRepository: { signInWithEmail, sendPasswordResetEmail },
}));
mock.module("@/src/features/auth/data/login-history", () => ({
	cachedLoginIdentifiers: () => [...rememberedIdentifiers],
	readLoginIdentifiers: async () => [...rememberedIdentifiers],
	rememberLoginIdentifier,
	clearLoginIdentifiers: async () => {},
}));

const { default: LoginScreen, ForgotPasswordDialog } = await import(
	"../../../../app/(auth)/login"
);

/**
 * Cada caso arranca con el estado limpio: el arnés guarda los valores entre
 * montajes —para que un toque se vea— y ese estado no puede pasar de un caso
 * al siguiente.
 */
beforeEach(() => {
	stateValues.length = 0;
	rememberedIdentifiers = [];
	toasts.length = 0;
	navigations.length = 0;
	sendPasswordResetEmail.mockClear();
	signInWithEmail.mockClear();
	rememberLoginIdentifier.mockClear();
});

/** Monta sin borrar el estado: es lo que ve el efecto de un toque. */
function montar(element: React.ReactElement): string {
	stateIndex = 0;
	textFields.length = 0;
	pressables.length = 0;
	elementKeys.length = 0;
	return renderToStaticMarkup(element);
}

function montarPantalla(): string {
	return montar(React.createElement(LoginScreen));
}

function montarDialogo(initialEmail: string): string {
	return montar(
		React.createElement(ForgotPasswordDialog, {
			initialEmail,
			onClose: () => {},
		}),
	);
}

function campo(label: string): TextFieldProbe {
	const found = textFields.find((field) => field.label === label);
	if (!found)
		throw new Error(`no se montó ningún campo con la etiqueta ${label}`);
	return found;
}

function tocarChip(identifier: string): void {
	const chip = pressables.find((item) => item.label === identifier);
	if (!chip?.onPress) throw new Error(`no se montó ningún chip ${identifier}`);
	chip.onPress();
}

/** La llave con la que se montó el campo del PIN en el último render. */
function llaveDelPin(): string | null {
	const pines = elementKeys.filter(
		(entry) => entry.label === strings.auth.password,
	);
	return pines.length > 0 ? (pines[pines.length - 1]?.key ?? null) : null;
}

// ─── El diálogo condicional (§9.1) ────────────────────────────────────────────

test("un alias de negocio avisa que no usa correo y no envía nada", async () => {
	const markup = montarDialogo("cajero@mibarrio.role.ec");

	expect(markup).toContain(strings.auth.staffNoMailboxNotice);
	expect(markup).not.toContain(strings.auth.sendLink);

	// El teclado también puede disparar el envío: la guarda está en el envío.
	await campo(strings.auth.email).onSubmitEditing?.();
	expect(sendPasswordResetEmail).not.toHaveBeenCalled();
});

test("el ápice tampoco tiene bandeja detrás: mismo aviso y ningún envío", async () => {
	const markup = montarDialogo("ana@role.ec");

	expect(markup).toContain(strings.auth.staffNoMailboxNotice);
	await campo(strings.auth.email).onSubmitEditing?.();
	expect(sendPasswordResetEmail).not.toHaveBeenCalled();
});

test("un dominio propio sigue el flujo normal de hoy", async () => {
	const markup = montarDialogo("ana@dominio.com");

	expect(markup).toContain(strings.auth.resetDescription);
	expect(markup).toContain(strings.auth.sendLink);

	await campo(strings.auth.email).onSubmitEditing?.();
	expect(sendPasswordResetEmail).toHaveBeenCalledWith("ana@dominio.com");
	expect(toasts).toContain(strings.auth.resetSentMessage);
});

test("la decisión sigue al identificador que se escribe en el diálogo", async () => {
	montarDialogo("cajero@mibarrio.role.ec");

	// El identificador se corrige: el flujo normal vuelve a existir, porque la
	// pregunta es del correo que hay, no del que había.
	campo(strings.auth.email).onChangeText?.("ana@dominio.com");
	const markup = montarDialogo("cajero@mibarrio.role.ec");

	expect(markup).toContain(strings.auth.resetDescription);
	expect(markup).toContain(strings.auth.sendLink);
	expect(markup).not.toContain(strings.auth.staffNoMailboxNotice);

	await campo(strings.auth.email).onSubmitEditing?.();
	expect(sendPasswordResetEmail).toHaveBeenCalledWith("ana@dominio.com");
});

test("y al revés: un dominio propio que pasa a ser de staff deja de enviar", async () => {
	montarDialogo("ana@dominio.com");

	campo(strings.auth.email).onChangeText?.("cajero@mibarrio.role.ec");
	const markup = montarDialogo("ana@dominio.com");

	expect(markup).toContain(strings.auth.staffNoMailboxNotice);
	expect(markup).not.toContain(strings.auth.sendLink);

	await campo(strings.auth.email).onSubmitEditing?.();
	expect(sendPasswordResetEmail).not.toHaveBeenCalled();
});

test("un identificador a medias no decide nada: el diálogo es el de siempre", () => {
	const markup = montarDialogo("ana");

	// Todavía no hay una dirección que juzgar: el aviso de las cuentas de
	// negocio no puede caerle a un consumidor que está escribiendo su correo.
	expect(markup).toContain(strings.auth.resetDescription);
	expect(markup).toContain(strings.auth.sendLink);
	expect(markup).not.toContain(strings.auth.staffNoMailboxNotice);
});

test("y al completar el identificador de staff, el aviso aparece", () => {
	montarDialogo("caje");

	campo(strings.auth.email).onChangeText?.("cajero@mibarrio.role.ec");
	const markup = montarDialogo("caje");

	expect(markup).toContain(strings.auth.staffNoMailboxNotice);
	expect(markup).not.toContain(strings.auth.sendLink);
});

// ─── Los chips con los identificadores usados en este dispositivo ────────────

test("sin identificadores recordado no hay chips", () => {
	rememberedIdentifiers = [];

	const markup = montarPantalla();

	expect(markup).not.toContain(strings.auth.recentIdentifiers);
});

test("el chip llena el campo del identificador y lleva el foco al PIN", () => {
	rememberedIdentifiers = ["cajero@mibarrio.role.ec"];

	const markup = montarPantalla();
	expect(markup).toContain(strings.auth.recentIdentifiers);
	expect(markup).toContain("cajero@mibarrio.role.ec");
	// Antes del toque el PIN no está enfocado: el foco se pide al tocar.
	expect(campo(strings.auth.password).autoFocus).toBe(false);

	tocarChip("cajero@mibarrio.role.ec");
	montarPantalla();

	expect(campo(strings.auth.email).value).toBe("cajero@mibarrio.role.ec");
	expect(campo(strings.auth.password).autoFocus).toBe(true);
});

test("el foco al PIN pide un remontaje: la llave del campo cambia", () => {
	rememberedIdentifiers = ["cajero@mibarrio.role.ec"];

	montarPantalla();
	const antes = llaveDelPin();
	expect(antes).not.toBeNull();

	tocarChip("cajero@mibarrio.role.ec");
	montarPantalla();
	const despues = llaveDelPin();

	// Un `autoFocus` sólo actúa al montar: sin una llave nueva, el campo no se
	// remonta y el foco se queda donde estaba.
	expect(despues).not.toBe(antes);
	expect(despues).not.toBeNull();
});

// ─── El campo del identificador no ofrece el correo del sistema ──────────────

test("el campo del identificador no ofrece el correo del sistema", () => {
	montarPantalla();

	expect(campo(strings.auth.email).autoComplete).toBeUndefined();
	expect(campo(strings.auth.email).textContentType).toBeUndefined();
	// El PIN sí es una credencial conocida del sistema.
	expect(campo(strings.auth.password).autoComplete).toBe("current-password");
	expect(campo(strings.auth.password).textContentType).toBe("password");

	// Y el diálogo de recuperación sí es un correo: ahí el autofill ayuda.
	montarDialogo("ana@dominio.com");
	expect(campo(strings.auth.email).autoComplete).toBe("email");
	expect(campo(strings.auth.email).textContentType).toBe("emailAddress");
});

// ─── Tras un login exitoso se recuerda el identificador ──────────────────────

test("tras un login exitoso se recuerda el identificador", async () => {
	montarPantalla();
	campo(strings.auth.email).onChangeText?.("ana@dominio.com");
	campo(strings.auth.password).onChangeText?.("secreto123");
	montarPantalla();

	await campo(strings.auth.password).onSubmitEditing?.();

	expect(signInWithEmail).toHaveBeenCalledWith("ana@dominio.com", "secreto123");
	expect(rememberLoginIdentifier).toHaveBeenCalledWith("ana@dominio.com");
	expect(navigations).toEqual(["/(consumer)"]);
});
