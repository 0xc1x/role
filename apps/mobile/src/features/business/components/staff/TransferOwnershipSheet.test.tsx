import { beforeEach, expect, jest, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type { BusinessMemberDto } from "@0xc1x/role-commons";
import { fromApiResponse } from "@/src/core/api/errors";
import type { AppError } from "@/src/core/error/app-error";
import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

/**
 * La transferencia de la propiedad del negocio (Plan 4, Task 13).
 *
 * ─── LO QUE SE AFIRMA AQUÍ ────────────────────────────────────────────────────
 *
 *  1. La confirmación dice A QUIÉN se transfiere y lo que les pasa a los dos:
 *     quien recibe pasa a ser el dueño y quien entrega queda como gerente con
 *     el mismo alcance.
 *  2. La consecuencia real está escrita: un dueño no se puede pausar ni dar de
 *     baja, y no puede borrar su cuenta mientras el negocio siga activo.
 *  3. Antes de confirmar no sale NADA por la red; después sale la llamada
 *     exacta: `POST /businesses/:businessId/ownership/transfer` con el cuerpo
 *     `{ new_owner_member_id }`.
 *  4. El acierto se anuncia con los NOMBRES DE LA RESPUESTA —no con los que
 *     la app adivinaba— y deja a la persona en el panel del negocio.
 *  5. Un fallo se pinta con la prosa que escribió el API y deja la hoja
 *     abierta y utilizable.
 *
 * ─── POR QUÉ SE AFIRMA LA LLAMADA Y NO «QUÉ HOOK CORRIÓ» ────────────────────────
 *
 * Porque lo que importa es lo que sale por la red: que la transferencia vaya a
 * la ruta de la PROPIEDAD —y no a la de una pausa— es un hecho del CONTRATO, no
 * del implementation. Por eso la hoja se monta con las MUTACIONES REALES y con
 * un cliente de React Query real, y lo que se mira es un doble del cliente
 * HTTP —el mismo doble que usa el test del repositorio—.
 */

const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const PREVIOUS_OWNER_ID = "99999999-9999-4999-8999-999999999999";

/** Un acceso tal como lo ve el panel. */
function member(overrides: Partial<BusinessMemberDto> = {}): BusinessMemberDto {
	return {
		id: MEMBER_ID,
		business_id: BUSINESS_ID,
		user_id: "33333333-3333-4333-8333-333333333333",
		role: "manager",
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

/** El acceso que va a recibir la propiedad. */
const TARGET = member({ role: "manager", label: "Ana Torres" });

/**
 * La respuesta de la transferencia.
 *
 * Los NOMBRES son distintos de los del acceso: la hoja tiene que anunciar lo
 * que devolvió el API, no lo que la app suponía antes de llamar.
 */
const RESPONSE = {
	previous_owner: member({
		id: PREVIOUS_OWNER_ID,
		user_id: "44444444-4444-4444-8444-444444444444",
		role: "manager",
		label: "Rosa Pérez",
		alias: "rosa@panaderia.role.ec",
	}),
	new_owner: member({
		role: "owner",
		label: "Ana Torres (dueña)",
	}),
};

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

/** La hoja: su título y su pie. */
let sheetProps: { title?: string; footer?: ReactNode } | null = null;

/**
 * Los textos pintados, con su prosa y su `style`.
 *
 * El `style` es lo que se mira para el CONTRASTE: el color del texto va en la
 * prop, no en el HTML, y el color es el dato.
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
	BottomSheetModal: (props: {
		title?: string;
		onClose?: () => void;
		children?: ReactNode;
		footer?: ReactNode;
	}) => {
		sheetProps = props;
		return createElement(
			nativeWeb.View,
			null,
			props.title ? createElement(nativeWeb.Text, null, props.title) : null,
			props.children,
			props.footer ?? null,
		);
	},
}));

mock.module("@/components/ui/text", () => ({
	Text: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.Text, null, children),
}));

/** Los avisos que se pintaron. */
const toasts: string[] = [];

mock.module("sonner-native", () => ({
	toast: {
		success: (message: string) => {
			toasts.push(message);
		},
		error: (message: string) => {
			toasts.push(message);
		},
	},
}));

/** Las navegaciones que se pidieron. */
const navigations: string[] = [];

mock.module("expo-router", () => ({
	router: {
		push: (path: string) => navigations.push(path),
		replace: (path: string) => navigations.push(path),
	},
}));

// ─── Un `useState` que REALMENTE guarda ──────────────────────────────────────
//
// `renderToStaticMarkup` es un render único: la fibra se descarta y un
// `setState` posterior no vuelve a pintar nada. El reemplazo guarda el valor
// en una casilla que sobrevive entre renders, así que el ciclo escribir →
// volver a renderizar → leer es el mismo que en la app.
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

const { TransferOwnershipSheet } = await import("./TransferOwnershipSheet");

// ─── El render ───────────────────────────────────────────────────────────────

let html = "";
let client: QueryClient;
/** Los cierres de la hoja que se pidieron. */
const closed: string[] = [];

function render(): void {
	hookCursor = 0;
	buttons = [];
	texts = [];
	sheetProps = null;
	html = renderToStaticMarkup(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(TransferOwnershipSheet, {
				businessId: BUSINESS_ID,
				member: TARGET,
				onClose: () => closed.push("close"),
			}),
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

/** La etiqueta del botón que confirma la transferencia. */
function confirmLabel(): string {
	return strings.business.staff.transferConfirm.replace("{name}", TARGET.label);
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

/** Drena la cadena de microtareas de la mutación. */
async function flush(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
	await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	apiGet.mockReset();
	apiPost.mockReset();
	apiPatch.mockReset();
	apiDelete.mockReset();
	apiPost.mockResolvedValue(RESPONSE);
	apiDelete.mockResolvedValue(undefined);
	toasts.length = 0;
	navigations.length = 0;
	closed.length = 0;
	slots.length = 0;
	client = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	// La lista del equipo: la transferencia la invalida al salir bien.
	client.setQueryData(["staff", "list", BUSINESS_ID], [TARGET]);
});

// ─── La confirmación ──────────────────────────────────────────────────────────

test("la confirmación dice a QUIÉN se transfiere la propiedad", () => {
	render();

	// El nombre del acceso que recibe es parte de la confirmación: una
	// transferencia sin objeto es una transferencia a ciegas.
	expect(html).toContain(TARGET.label);
	// Y el TÍTULO de la hoja lo nombra: el disparador —«Transferir la
	// propiedad»— no lo dice, y el lector de pantalla anuncia el título.
	expect(sheetProps?.title).toBe(
		strings.business.staff.transferSheetTitle.replace("{name}", TARGET.label),
	);
});

test("la confirmación dice que quien recibe queda como dueño y quien entrega como gerente", () => {
	render();

	// Las DOS consecuencias, en la prosa de la casa.
	expect(html).toContain(
		strings.business.staff.transferBody.replace("{name}", TARGET.label),
	);
	expect(strings.business.staff.transferBody).toContain("dueño");
	expect(strings.business.staff.transferBody).toContain("gerente");
	// Y el alcance del que entrega NO cambia: sigue alcanzando lo mismo.
	expect(strings.business.staff.transferBody).toContain("mismo alcance");
});

test("la confirmación avisa de que un dueño no se puede pausar ni dar de baja", () => {
	render();

	expect(html).toContain(strings.business.staff.transferOwnerWarning);
	// El aviso es del dueño NUEVO: quien recibe hereda esa condición.
	expect(strings.business.staff.transferOwnerWarning).toContain("dueño");
	expect(strings.business.staff.transferOwnerWarning).toContain(
		"borrar su cuenta",
	);
	// Y es un AVISO, no un fallo: lleva el ámbar de la casa, que es el único
	// token de prosa que pasa AA en los dos temas.
	expect(textStyle(strings.business.staff.transferOwnerWarning)).toEqual({
		color: light.warningText,
	});
});

test("la hoja ofrece cancelar y confirmar, y el botón dice a QUIÉN", () => {
	render();

	expect(button(strings.common.cancel)).toBeDefined();
	const confirm = button(confirmLabel());
	expect(confirm).toBeDefined();
	// El botón dice el objeto de la transferencia: «Hacer a Ana Torres el
	// dueño», no un «Confirmar» a secas.
	expect(confirm?.label).toContain(TARGET.label);
});

// ─── La llamada ──────────────────────────────────────────────────────────────

test("antes de confirmar no sale nada por la red", () => {
	render();

	expect(apiPost).toHaveBeenCalledTimes(0);
});

test("al confirmar sale POST .../ownership/transfer con el cuerpo exacto", async () => {
	render();
	button(confirmLabel())?.onPress?.();
	await flush();

	expect(apiPost).toHaveBeenCalledTimes(1);
	expect(apiPost.mock.calls[0]?.[0]).toBe(
		`/businesses/${BUSINESS_ID}/ownership/transfer`,
	);
	// Y el cuerpo lleva la MEMBRESÍA que recibe, no la de la persona.
	expect(apiPost.mock.calls[0]?.[1]).toEqual({
		new_owner_member_id: MEMBER_ID,
	});
});

test("la transferencia invalida la lista del equipo y los negocios", async () => {
	// El panel lee el rol del dueño de `useBusinesses`, y esa consulta vive
	// bajo el prefijo `["businesses"]`.
	client.setQueryData(
		["businesses", "operated", "33333333-3333-4333-8333-333333333333"],
		[],
	);

	render();
	button(confirmLabel())?.onPress?.();
	await flush();

	// El dueño cambió: la lista del equipo y el panel tienen que volver a
	// leerse.
	expect(
		client.getQueryState(["staff", "list", BUSINESS_ID])?.isInvalidated,
	).toBe(true);
	expect(
		client.getQueryState([
			"businesses",
			"operated",
			"33333333-3333-4333-8333-333333333333",
		])?.isInvalidated,
	).toBe(true);
});

// ─── El acierto ──────────────────────────────────────────────────────────────

test("el acierto se anuncia con los nombres de la RESPUESTA y lleva al panel", async () => {
	render();
	button(confirmLabel())?.onPress?.();
	await flush();

	// Los nombres son los del API, no los que la app suponía: el aviso dice
	// «Ana Torres (dueña)» —la respuesta— y no «Ana Torres» —el acceso—.
	const expected = strings.business.staff.transferSuccess
		.replace("{newOwner}", RESPONSE.new_owner.label)
		.replace("{previousOwner}", RESPONSE.previous_owner.label);
	expect(toasts).toContain(expected);
	expect(expected).toContain(RESPONSE.new_owner.label);
	expect(expected).toContain(RESPONSE.previous_owner.label);

	// Y la persona vuelve al panel del negocio, no hacia atrás: el rol que
	// tiene ahora es otro.
	expect(navigations).toEqual([`/business/${BUSINESS_ID}`]);
	// La hoja se cierra.
	expect(closed).toEqual(["close"]);
});

test("el acierto no se anuncia con el nombre que la app suponía", async () => {
	render();
	button(confirmLabel())?.onPress?.();
	await flush();

	const spoken = toasts.join(" ");
	expect(spoken).toContain(RESPONSE.new_owner.label);
	expect(spoken).toContain(RESPONSE.previous_owner.label);
	expect(spoken).not.toContain(
		strings.business.staff.transferSuccess.replace("{newOwner}", TARGET.label),
	);
});

// ─── El fallo ────────────────────────────────────────────────────────────────

/**
 * La prosa que el API escribe en su sobre cuando la transferencia se rechaza.
 *
 * El `R0004` de la base llega como un 422 con el motivo —«el receptor tiene
 * que ser un acceso vivo de este negocio»— y esa prosa ES la copia del
 * producto: se muestra tal cual.
 */
const SERVER_PROSE = "el receptor tiene que ser un acceso vivo de este negocio";

/**
 * El 422 TAL COMO LLEGA EN PRODUCCIÓN.
 *
 * Se construye con `fromApiResponse` —el mismo camino que el cliente— y no
 * con un error inventado a mano: un error inalcanzable haría que el test
 * afirmara sobre una ficción.
 */
async function refusalFromApi(): Promise<AppError> {
	const rejection = await fromApiResponse(
		new Response(
			JSON.stringify({
				statusCode: 422,
				message: SERVER_PROSE,
				error: "Unprocessable Entity",
			}),
			{ status: 422, headers: { "content-type": "application/json" } },
		),
		`/businesses/${BUSINESS_ID}/ownership/transfer`,
	).catch((cause: unknown) => cause);
	return rejection as AppError;
}

test("un rechazo se pinta con la prosa del API y deja la hoja utilizable", async () => {
	apiPost.mockRejectedValue(await refusalFromApi());

	render();
	button(confirmLabel())?.onPress?.();
	await flush();
	render();

	// Lo que ve la persona es la prosa del API: la app no la tapa.
	expect(html).toContain(SERVER_PROSE);
	// Y se pinta con el rojo de la casa: el `destructive` oscuro no se lee
	// sobre la superficie de la hoja.
	expect(textStyle(SERVER_PROSE)).toEqual({
		color: light.destructiveVibrant,
	});
	// Y la hoja sigue en pie: se puede leer y reintentar.
	expect(button(confirmLabel())).toBeDefined();
	expect(button(confirmLabel())?.disabled).toBe(false);
	// Y no se navega: la propiedad no cambió.
	expect(navigations).toEqual([]);
	expect(closed).toEqual([]);
});

test("un fallo sin prosa propia se pinta con la copia de la casa", async () => {
	apiPost.mockRejectedValue(new Error("boom"));

	render();
	button(confirmLabel())?.onPress?.();
	await flush();
	render();

	expect(html).toContain(strings.business.staff.transferError);
});

// ─── La transferencia en vuelo ───────────────────────────────────────────────

test("mientras la transferencia está en vuelo el botón no admite otro toque", async () => {
	let resolvePost: ((value: unknown) => void) | undefined;
	apiPost.mockImplementation(
		() =>
			new Promise((resolve) => {
				resolvePost = resolve;
			}),
	);

	render();
	button(confirmLabel())?.onPress?.();
	await flush();
	render();

	// Está en vuelo: el botón no se puede volver a pulsar.
	expect(button(confirmLabel())?.disabled).toBe(true);
	button(confirmLabel())?.onPress?.();
	await flush();

	expect(apiPost).toHaveBeenCalledTimes(1);

	resolvePost?.(RESPONSE);
	await flush();
	render();

	// Y vuelve a estar disponible cuando la transferencia termina.
	expect(button(confirmLabel())?.disabled).toBe(false);
});
