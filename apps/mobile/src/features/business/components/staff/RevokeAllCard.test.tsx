import { beforeEach, expect, jest, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type {
	BusinessMemberDto,
	BusinessMemberRole,
} from "@0xc1x/role-commons";
import { fromApiResponse } from "@/src/core/api/errors";
import { type AppError, Errors } from "@/src/core/error/app-error";
import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

/**
 * El corte de emergencia, del lado del panel (Task 12).
 *
 * ─── LO QUE SE AFIRMA AQUÍ ────────────────────────────────────────────────────
 *
 *  1. El botón sólo existe para quien ADMINISTRA: un empleado no lo ve, y la
 *     tarjeta no pinta nada.
 *  2. Antes de confirmar no sale NADA por la red; después sale la llamada
 *     exacta: `POST /businesses/:businessId/staff/revoke-all`.
 *  3. El acierto dice CUÁNTOS accesos se cortaron —el conteo de la respuesta— y
 *     dice que el dueño quedó fuera SÓLO cuando la respuesta lo dice.
 *  4. Un negocio sin accesos activos no es «se cortaron 0»: es «no había
 *     accesos activos que cortar».
 *  5. Un 403 se pinta con la COPIA CURADA de la taxonomía —la que el cliente
 *     entrega en `error.message`— y deja la tarjeta usable: se puede volver a
 *     intentarlo. La prosa cruda del servidor NO se muestra: vive en
 *     `context.serverMessage`, para el diagnóstico (política de T1).
 *  6. Un gerente ve, además, que su propio acceso se corta: el servidor corta
 *     a quien llama y sólo deja fuera al dueño.
 *  7. Los textos de la tarjeta se pintan con los colores que CONTRASTAN con
 *     su fondo, y la acción de confirmar no repite el título de la ventana.
 *
 * ─── POR QUÉ SE AFIRMA LA LLAMADA Y NO «QUÉ HOOK CORRIÓ» ──────────────────────
 *
 * Porque lo que importa es lo que sale por la red: que el corte vaya a la ruta
 * del contrato —y no a la de una pausa— es un hecho del CONTRATO, no del
 * implementation. Por eso la tarjeta se monta con las MUTACIONES REALES y con
 * un cliente de React Query real, y lo que se mira es un doble del cliente
 * HTTP —el mismo doble que usa el test del repositorio—.
 */

const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "33333333-3333-4333-8333-333333333333";

/** Un acceso tal como lo ve el panel. */
function member(overrides: Partial<BusinessMemberDto> = {}): BusinessMemberDto {
	return {
		id: MEMBER_ID,
		business_id: BUSINESS_ID,
		user_id: USER_ID,
		role: "staff",
		label: "Ana Torres",
		alias: "ana@panaderia.role.ec",
		status: "active",
		session_ttl_hours: 8,
		business_location_ids: [],
		last_authenticated_at: null,
		created_at: "2026-10-01T10:00:00.000Z",
		updated_at: "2026-10-01T10:00:00.000Z",
		deleted_at: null,
		...overrides,
	};
}

// ─── El doble del cliente HTTP ───────────────────────────────────────────────

const apiGet = jest.fn<(path: string) => Promise<unknown>>();
const apiPost = jest.fn<(path: string, body?: unknown) => Promise<unknown>>();
const apiPatch = jest.fn<(path: string, body?: unknown) => Promise<unknown>>();
const apiDelete = jest.fn<(path: string) => Promise<unknown>>();

mock.module("@/src/core/api/client", () => ({
	api: { get: apiGet, post: apiPost, patch: apiPatch, delete: apiDelete },
}));

// Los hooks del negocio viven en el mismo módulo que los del equipo, y ese
// módulo arrastra repositorios que hablan con Supabase: sin estos dobles el
// fichero no llega a cargarse.
mock.module("sonner-native", () => ({
	toast: { error: () => {}, success: () => {} },
}));
mock.module("@/src/features/business/data/repository", () => ({
	businessRepository: {},
	deleteOffer: mock(async () => undefined),
	saveOffer: mock(async () => ({ imageUploadFailed: false })),
}));
mock.module("@/src/features/business/data/notifications", () => ({
	notificationRepository: {
		getPreferences: mock(async () => ({})),
		updatePreferences: mock(async () => ({})),
	},
}));
mock.module("@/src/features/orders/data/repository", () => ({
	orderRepository: {},
}));

// ─── Los dobles de la UI ─────────────────────────────────────────────────────

mockNativeUi();

mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));

/** Los botones pintados, con su etiqueta, su `onPress` y su `disabled`. */
interface ButtonProbe {
	label: string;
	onPress?: () => void;
	disabled?: boolean;
	accessibilityLabel?: string;
}
let buttons: ButtonProbe[] = [];

mock.module("@/components/ui/button", () => ({
	Button: (props: {
		children?: ReactNode;
		onPress?: () => void;
		disabled?: boolean;
		accessibilityLabel?: string;
	}) => {
		buttons.push({
			label: textOf(props.children),
			onPress: props.onPress,
			disabled: props.disabled,
			accessibilityLabel: props.accessibilityLabel,
		});
		return createElement(nativeWeb.Text, null, props.children);
	},
}));

/**
 * Los textos pintados, con su prosa y su `style`.
 *
 * El `style` es lo que se mira para el CONTRASTE: el color del texto va en la
 * prop, no en el HTML, y el color es el dato (un texto apagado sobre la
 * superficie destructiva no se lee).
 */
interface TextProbe {
	text: string;
	style?: unknown;
}
let texts: TextProbe[] = [];

mock.module("@/src/core/ui", () => ({
	AppText: (props: { children?: ReactNode; style?: unknown }) => {
		texts.push({ text: textOf(props.children), style: props.style });
		return createElement(nativeWeb.Text, null, props.children);
	},
}));

mock.module("@/components/ui/text", () => ({
	Text: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.Text, null, children),
}));

/** La ventana de confirmación: lo que dice y lo que se puede pulsar. */
interface DialogProbe {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	title?: string;
	description?: string;
	confirm?: {
		label: string;
		onPress?: () => void;
		disabled?: boolean;
		style?: unknown;
		labelStyle?: unknown;
	};
	cancel?: { label: string; onPress?: () => void };
}
let dialog: DialogProbe = {};

mock.module("@/components/ui/alert-dialog", () => ({
	AlertDialog: (props: {
		open: boolean;
		onOpenChange?: (open: boolean) => void;
		children?: ReactNode;
	}) => {
		dialog.open = props.open;
		dialog.onOpenChange = props.onOpenChange;
		return props.open
			? createElement(nativeWeb.View, null, props.children)
			: null;
	},
	AlertDialogContent: (props: { children?: ReactNode }) =>
		createElement(nativeWeb.View, null, props.children),
	AlertDialogHeader: (props: { children?: ReactNode }) =>
		createElement(nativeWeb.View, null, props.children),
	AlertDialogTitle: (props: { children?: ReactNode }) => {
		dialog.title = textOf(props.children);
		return createElement(nativeWeb.Text, null, props.children);
	},
	AlertDialogDescription: (props: { children?: ReactNode }) => {
		dialog.description = textOf(props.children);
		return createElement(nativeWeb.Text, null, props.children);
	},
	AlertDialogFooter: (props: { children?: ReactNode }) =>
		createElement(nativeWeb.View, null, props.children),
	AlertDialogAction: (props: {
		children?: ReactNode;
		onPress?: () => void;
		disabled?: boolean;
		style?: unknown;
	}) => {
		dialog.confirm = {
			label: textOf(props.children),
			onPress: props.onPress,
			disabled: props.disabled,
			style: props.style,
			labelStyle: labelStyle(props.children),
		};
		return createElement(nativeWeb.Text, null, props.children);
	},
	AlertDialogCancel: (props: {
		children?: ReactNode;
		onPress?: () => void;
	}) => {
		dialog.cancel = { label: textOf(props.children), onPress: props.onPress };
		return createElement(nativeWeb.Text, null, props.children);
	},
}));

// ─── Un `useState` que REALMENTE guarda ──────────────────────────────────────
//
// `renderToStaticMarkup` es un render único: la fibra se descarta y un
// `setState` posterior no vuelve a pintar nada. El reemplazo guarda el valor
// en una casilla que sobrevive entre renders, así que el ciclo escribir →
// volver a renderizar → leer es el mismo que en la app.
//
// Y las casillas se numeran por el ORDEN DE LAS LLAMADAS que pasan por este
// doble: el cursor cuenta una por llamada. Hoy sólo la tarjeta las usa —React
// Query se cargó ANTES del doble y sigue con el `useState` de verdad—, pero
// una subida de versión que moviera una llamada al `useState` del doble
// desplazaría los índices. No cambia el comportamiento: sólo hay que revisar
// este arnés si eso ocurre.
const slots: unknown[] = [];
let hookCursor = 0;

function useStoredState(initial: unknown): [unknown, (next: unknown) => void] {
	const index = hookCursor;
	hookCursor += 1;
	if (!(index in slots)) {
		slots[index] =
			typeof initial === "function" ? (initial as () => unknown)() : initial;
	}
	return [
		slots[index],
		(next: unknown) => {
			slots[index] =
				typeof next === "function"
					? (next as (prev: unknown) => unknown)(slots[index])
					: next;
		},
	];
}

const React = await import("react");
mock.module("react", () => ({ ...React, useState: useStoredState }));

const { RevokeAllCard } = await import("./RevokeAllCard");

// ─── El render ───────────────────────────────────────────────────────────────

let html = "";
let client: QueryClient;

function render(role: BusinessMemberRole = "owner"): void {
	hookCursor = 0;
	buttons = [];
	texts = [];
	dialog = {};
	html = renderToStaticMarkup(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(RevokeAllCard, { businessId: BUSINESS_ID, role }),
		),
	);
}

/** El botón con esa etiqueta. */
function button(label: string): ButtonProbe | undefined {
	return buttons.find((candidate) => candidate.label === label);
}

/** El `style` del texto con esa prosa. */
function textStyle(copy: string): unknown {
	return texts.find((candidate) => candidate.text === copy)?.style;
}

/** El texto que un nodo pinta. */
function textOf(node: unknown): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(textOf).join("");
	const props =
		node && typeof node === "object" && "props" in node
			? (node as { props: unknown }).props
			: undefined;
	if (props && typeof props === "object" && "children" in props) {
		return textOf((props as { children: unknown }).children);
	}
	return "";
}

/**
 * El `style` de la etiqueta que compone el diálogo.
 *
 * El color del texto del botón lo decide el `style` que la etiqueta lleva: el
 * `Text` aplana `[{ color: laDeLaClase }, style]` y el `style` explícito
 * gana (`components/ui/text.tsx`). Por eso se mira la PROP que el diálogo
 * pasa, no el color que sale en el HTML.
 */
function labelStyle(children: ReactNode): unknown {
	if (!children || typeof children !== "object" || !("props" in children)) {
		return undefined;
	}
	return (children as { props: { style?: unknown } }).props.style;
}

/** Drena la cadena de microtareas de la mutación. */
async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Abre la confirmación y llega hasta el borde de «confirmar». */
function openDialog(role: BusinessMemberRole = "owner"): void {
	render(role);
	button(strings.business.staff.revokeAllTitle)?.onPress?.();
	render(role);
}

beforeEach(() => {
	apiGet.mockReset();
	apiPost.mockReset();
	apiPatch.mockReset();
	apiDelete.mockReset();
	apiPost.mockResolvedValue({ disabled: [], owner_skipped: false });
	apiDelete.mockResolvedValue(undefined);
	slots.length = 0;
	client = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	// La lista del equipo: el corte la invalida al salir bien.
	client.setQueryData(["staff", "list", BUSINESS_ID], [member()]);
});

// ─── Quién ve el botón ───────────────────────────────────────────────────────

test("un empleado no ve el botón: el corte no es suyo", () => {
	render("staff");

	expect(button(strings.business.staff.revokeAllTitle)).toBeUndefined();
	expect(html).not.toContain(strings.business.staff.revokeAllTitle);
});

test("el dueño ve el botón, y el botón dice a qué equipo corta", () => {
	render("owner");

	const cortar = button(strings.business.staff.revokeAllTitle);
	expect(cortar).toBeDefined();
	// La tarjeta se titula con lo que ES (un corte de emergencia) y el botón
	// con lo que HACE: dos etiquetas distintas, no la misma repetida.
	expect(html).toContain(strings.business.staff.revokeAllHeading);
	// El lector de pantalla necesita el objeto: «Cortar todos los accesos» a
	// secas no dice de QUÉ negocio.
	expect(cortar?.accessibilityLabel).toBe(
		strings.business.staff.revokeAllAccessibilityLabel,
	);
});

test("un gerente ve el botón", () => {
	render("manager");

	expect(button(strings.business.staff.revokeAllTitle)).toBeDefined();
});

// ─── La confirmación ──────────────────────────────────────────────────────────

test("el corte pide confirmación y avisa de que corta todo, sesiones abiertas incluidas", () => {
	openDialog("owner");

	expect(dialog.open).toBe(true);
	expect(dialog.title).toBe(strings.business.staff.revokeAllTitle);
	// Dice las DOS cosas: que corta todos los accesos del negocio, y que con
	// ellos se van las sesiones abiertas.
	expect(dialog.description).toContain("todos los accesos");
	expect(dialog.description).toContain("sesiones abiertas");
});

test("un gerente ve, además, que su propio acceso se corta", () => {
	openDialog("manager");

	// El servidor corta a QUIEN LLAMA y sólo deja fuera al dueño: si esto no
	// se dice, un gerente se queda fuera del negocio sin saber por qué.
	expect(dialog.description).toContain(
		strings.business.staff.revokeAllManagerWarning,
	);
});

test("el dueño no ve el aviso de su propio acceso: a él no se le corta", () => {
	openDialog("owner");

	expect(dialog.description).not.toContain(
		strings.business.staff.revokeAllManagerWarning,
	);
});

test("cancelar la confirmación no llama al API", () => {
	openDialog("owner");

	expect(dialog.cancel?.label).toBe(strings.common.cancel);

	// Cerrar la ventana sin confirmar es lo mismo que cancelar.
	dialog.onOpenChange?.(false);
	render("owner");

	expect(apiPost).toHaveBeenCalledTimes(0);
	expect(dialog.open).toBe(false);
});

test("la acción de confirmar no repite el título de la ventana", () => {
	openDialog("owner");

	// El lector de pantalla anuncia el título y la etiqueta del botón: si
	// fueran la misma frase, se oiría dos veces seguidas.
	expect(dialog.title).toBe(strings.business.staff.revokeAllTitle);
	expect(dialog.confirm?.label).toBe(
		strings.business.staff.revokeAllConfirmAction,
	);
	expect(dialog.confirm?.label).not.toBe(dialog.title);
});

// ─── La llamada ──────────────────────────────────────────────────────────────

test("antes de confirmar no sale nada por la red; después sale POST .../revoke-all", async () => {
	apiPost.mockResolvedValue({
		disabled: [member({ status: "disabled" })],
		owner_skipped: true,
	});

	openDialog("owner");

	// Antes de confirmar no sale NADA por la red.
	expect(apiPost).toHaveBeenCalledTimes(0);

	dialog.confirm?.onPress?.();
	await flush();

	expect(apiPost).toHaveBeenCalledTimes(1);
	expect(apiPost.mock.calls[0]?.[0]).toBe(
		`/businesses/${BUSINESS_ID}/staff/revoke-all`,
	);
	// Y el corte no lleva cuerpo: su alcance lo decide QUIEN llama.
	expect(apiPost.mock.calls[0]).toHaveLength(1);
});

test("el corte invalida la lista del equipo: todas las filas cambiaron", async () => {
	apiPost.mockResolvedValue({
		disabled: [member({ status: "disabled" })],
		owner_skipped: true,
	});

	openDialog("owner");
	dialog.confirm?.onPress?.();
	await flush();

	expect(
		client.getQueryState(["staff", "list", BUSINESS_ID])?.isInvalidated,
	).toBe(true);
});

// ─── El resultado ────────────────────────────────────────────────────────────

test("el acierto dice cuántos accesos se cortaron", async () => {
	apiPost.mockResolvedValue({
		disabled: [
			member({ status: "disabled" }),
			member({
				id: "55555555-5555-4555-8555-555555555555",
				status: "disabled",
			}),
		],
		owner_skipped: false,
	});

	openDialog("owner");
	dialog.confirm?.onPress?.();
	await flush();
	render("owner");

	// El conteo es el de la respuesta, no una frase fija.
	expect(html).toContain(
		strings.business.staff.revokeAllResult.replace("{count}", "2"),
	);
});

test("un solo acceso cortado se dice en singular", async () => {
	apiPost.mockResolvedValue({
		disabled: [member({ status: "disabled" })],
		owner_skipped: false,
	});

	openDialog("owner");
	dialog.confirm?.onPress?.();
	await flush();
	render("owner");

	// «Se cortaron 1 accesos» no es español.
	expect(html).toContain(strings.business.staff.revokeAllResultOne);
});

test("el acierto dice que el dueño quedó fuera cuando la respuesta lo dice", async () => {
	apiPost.mockResolvedValue({
		disabled: [member({ status: "disabled" })],
		owner_skipped: true,
	});

	openDialog("owner");
	dialog.confirm?.onPress?.();
	await flush();
	render("owner");

	expect(html).toContain(strings.business.staff.revokeAllResultOwnerSkipped);
});

test("sin dueño vivo no se dice que el dueño quedó fuera", async () => {
	apiPost.mockResolvedValue({
		disabled: [member({ status: "disabled" })],
		owner_skipped: false,
	});

	openDialog("owner");
	dialog.confirm?.onPress?.();
	await flush();
	render("owner");

	expect(html).not.toContain(
		strings.business.staff.revokeAllResultOwnerSkipped,
	);
});

test("un negocio sin accesos activos no es «se cortaron 0»", async () => {
	apiPost.mockResolvedValue({ disabled: [], owner_skipped: false });

	openDialog("owner");
	dialog.confirm?.onPress?.();
	await flush();
	render("owner");

	expect(html).toContain(strings.business.staff.revokeAllResultEmpty);
	expect(html).not.toContain("0 accesos");
});

// ─── El contraste ────────────────────────────────────────────────────────────

test("los textos de la tarjeta se pintan con los colores que contrastan", async () => {
	apiPost.mockResolvedValue({
		disabled: [member({ status: "disabled" })],
		owner_skipped: true,
	});

	openDialog("owner");
	dialog.confirm?.onPress?.();
	await flush();
	render("owner");

	// El fondo de la tarjeta es la superficie destructiva: el color apagado no
	// llega al 4.5:1 que pide un `bodySmall`.
	expect(textStyle(strings.business.staff.revokeAllBody)).toEqual({
		color: light.foreground,
	});
	expect(textStyle(strings.business.staff.revokeAllResultOwnerSkipped)).toEqual(
		{
			color: light.foreground,
		},
	);
});

// ─── El fallo ────────────────────────────────────────────────────────────────

/**
 * La prosa que el API escribe en su sobre cuando el corte se rechaza.
 *
 * El API habla en español para esta persona («Un empleado no administra los
 * accesos del negocio»), pero el cliente NO la muestra: la política de T1
 * (`src/core/api/errors.ts`) reserva la prosa del servidor para las
 * categorías cuya copia ES la del producto, y un 403 no lo es —el guard de
 * auth responde en inglés y `orders`/`reviews` escriben texto técnico—.
 */
const SERVER_PROSE = "Un empleado no administra los accesos del negocio.";

/**
 * El 403 TAL COMO LLEGA EN PRODUCCIÓN.
 *
 * Se construye con `fromApiResponse` —el mismo camino que el cliente— y no
 * con un `Errors.forbidden(...)` a mano: un error de ForbiddenException
 * inventado es construible, pero INALCANZABLE, y un test que afirma sobre él
 * afirma sobre una ficción.
 */
async function forbiddenFromApi(): Promise<AppError> {
	const rejection = await fromApiResponse(
		new Response(
			JSON.stringify({
				statusCode: 403,
				message: SERVER_PROSE,
				error: "Forbidden",
			}),
			{ status: 403, headers: { "content-type": "application/json" } },
		),
		`/businesses/${BUSINESS_ID}/staff/revoke-all`,
	).catch((cause: unknown) => cause);
	return rejection as AppError;
}

test("un 403 se pinta con la copia curada de la taxonomía y deja la tarjeta usable", async () => {
	const error = await forbiddenFromApi();
	apiPost.mockRejectedValue(error);

	openDialog("owner");
	dialog.confirm?.onPress?.();
	await flush();
	render("owner");

	// Lo que ve la persona es la COPIA CURADA, tal cual: el mensaje del error,
	// sin taparlo con un texto genérico.
	expect(html).toContain(Errors.forbidden().message);
	// Y la prosa cruda del servidor NO sale: es diagnóstico, no copia.
	expect(html).not.toContain(SERVER_PROSE);
	// Pero no se pierde: vive en el contexto, para el log.
	expect(error.context?.serverMessage).toBe(SERVER_PROSE);
	// Y la tarjeta sigue en pie: se puede volver a intentarlo.
	expect(button(strings.business.staff.revokeAllTitle)).toBeDefined();
	expect(button(strings.business.staff.revokeAllTitle)?.disabled).toBe(false);
});

test("un fallo sin prosa propia se pinta con la copia de la casa", async () => {
	apiPost.mockRejectedValue(new Error("boom"));

	openDialog("owner");
	dialog.confirm?.onPress?.();
	await flush();
	render("owner");

	expect(html).toContain(strings.business.genericError);
	// Y con el rojo de la casa: el `destructive` oscuro no se lee sobre la
	// superficie destructiva.
	expect(textStyle(strings.business.genericError)).toEqual({
		color: light.destructiveVibrant,
	});
});

// ─── El corte en vuelo ───────────────────────────────────────────────────────

test("mientras el corte está en vuelo el botón no admite otro toque", async () => {
	let resolvePost: ((value: unknown) => void) | undefined;
	apiPost.mockImplementation(
		() =>
			new Promise((resolve) => {
				resolvePost = resolve;
			}),
	);

	openDialog("owner");
	dialog.confirm?.onPress?.();
	await flush();

	// El corte está en vuelo: el botón no se puede volver a pulsar, así que
	// no hay segundo corte.
	render("owner");
	expect(button(strings.business.staff.revokeAllTitle)?.disabled).toBe(true);
	expect(apiPost).toHaveBeenCalledTimes(1);

	resolvePost?.({ disabled: [], owner_skipped: false });
	await flush();
	render("owner");

	// Y vuelve a estar disponible cuando el corte termina.
	expect(button(strings.business.staff.revokeAllTitle)?.disabled).toBe(false);
});
