import { beforeEach, expect, jest, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import type {
	BusinessMemberDeliveryCardDto,
	BusinessMemberDto,
	BusinessMemberRole,
} from "@0xc1x/role-commons";
import { Errors } from "@/src/core/error/app-error";
import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

/**
 * Las acciones sobre un acceso del equipo (§9.2).
 *
 * ─── LO QUE SE AFIRMA AQUÍ ────────────────────────────────────────────────────
 *
 *  1. Las acciones dependen del ESTADO del acceso: un acceso activo ofrece
 *     editar, rotar, pausar y dar de baja; uno pausado ofrece reactivar y dar
 *     de baja. El dueño no ofrece ninguna.
 *  2. Cada mutación está detrás de su CONFIRMACIÓN: antes de confirmar no sale
 *     nada por la red, y después sale la llamada exacta.
 *  3. Los VERBOS son los del §8, con los ids dentro de la ruta:
 *     `POST …/rotate`, `POST …/disable`, `POST …/enable` y `DELETE …/:memberId`.
 *  4. Rotar NO corta sesiones: no hay un `POST …/disable` en la llamada.
 *  5. La prosa de cada confirmación dice la consecuencia real: lo que pasa, lo
 *     que NO pasa y lo que no se recupera.
 *  6. Un fallo se pinta con la prosa que escribió el API y deja la hoja
 *     abierta; un acierto la cierra.
 *
 * ─── POR QUÉ SE AFIRMA EL VERBO Y NO «QUÉ HOOK CORRIÓ» ────────────────────────
 *
 * Porque lo que importa es lo que sale por la red: que «pausar» llame a
 * `disable` y no a `enable` es un hecho del CONTRATO, no del implementation.
 * Por eso la hoja se monta con las MUTACIONES REALES y con un cliente de
 * React Query real, y lo que se mira es un doble del cliente HTTP —el mismo
 * doble que usa el test del repositorio—.
 */

const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "11111111-1111-4111-8111-111111111111";

/** Un acceso tal como lo ve el panel. */
function member(overrides: Partial<BusinessMemberDto> = {}): BusinessMemberDto {
	return {
		id: MEMBER_ID,
		business_id: BUSINESS_ID,
		user_id: "33333333-3333-4333-8333-333333333333",
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

/** La tarjeta de entrega: la ÚNICA respuesta que lleva el PIN. */
const CARD: BusinessMemberDeliveryCardDto = {
	alias: "ana@panaderia.role.ec",
	pin: "482913",
	alias_warnings: [],
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

mockNativeUi({
	Share: { share: async () => {} },
});

mock.module("expo-clipboard", () => ({
	setStringAsync: async () => true,
}));

mock.module("react-native-qrcode-svg", () => ({
	default: (props: { value: string }) =>
		createElement(nativeWeb.Text, null, `QR:${props.value}`),
}));

mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));

/** Los botones pintados, con su etiqueta y su `onPress`. */
interface ButtonProbe {
	label: string;
	onPress?: () => void;
	accessibilityLabel?: string;
}
let buttons: ButtonProbe[] = [];

mock.module("@/components/ui/button", () => ({
	Button: (props: {
		children?: ReactNode;
		onPress?: () => void;
		accessibilityLabel?: string;
	}) => {
		buttons.push({
			label: textOf(props.children),
			onPress: props.onPress,
			accessibilityLabel: props.accessibilityLabel,
		});
		return createElement(nativeWeb.Text, null, props.children);
	},
}));

/** La hoja donde vive la tarjeta de entrega. */
let sheetProps: { title?: string } | null = null;

/**
 * Los textos pintados, con su prosa y su `style`.
 *
 * El `style` es lo que se mira para el CONTRASTE: el color del texto va en la
 * prop, no en el HTML, y el color es el dato (un texto apagado sobre la
 * superficie de la hoja no se lee).
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

/** La ventana de confirmación: lo que dice y lo que se puede pulsar. */
interface DialogProbe {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	title?: string;
	description?: string;
	confirm?: {
		label: string;
		onPress?: () => void;
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
		style?: unknown;
	}) => {
		dialog.confirm = {
			label: textOf(props.children),
			onPress: props.onPress,
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

const { StaffActionsSheet } = await import("./StaffActionsSheet");

// ─── El render ───────────────────────────────────────────────────────────────

let html = "";
let client: QueryClient;
/** Los cierres de la hoja que se pidieron. */
const closed: string[] = [];
/** La callback que recibe la tarjeta rotada. */
let onRotated: ((card: BusinessMemberDeliveryCardDto) => void) | undefined;

/**
 * El render con el rol de QUIEN MIRA.
 *
 * El rol va en un parámetro aparte —y sin valor por defecto— porque
 * `undefined` es un valor DELIBERADO: es «el rol todavía no se sabe», y un
 * parámetro con valor por defecto se lo comería.
 */
function renderWith(
	access: BusinessMemberDto,
	actorRole: BusinessMemberRole | undefined,
): void {
	hookCursor = 0;
	buttons = [];
	texts = [];
	dialog = {};
	sheetProps = null;
	html = renderToStaticMarkup(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(StaffActionsSheet, {
				businessId: BUSINESS_ID,
				member: access,
				actorRole,
				onClose: () => closed.push("close"),
				onRotated,
			}),
		),
	);
}

/** El render de siempre: quien mira es el dueño. */
function render(access: BusinessMemberDto = member()): void {
	renderWith(access, "owner");
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

beforeEach(() => {
	apiGet.mockReset();
	apiPost.mockReset();
	apiPatch.mockReset();
	apiDelete.mockReset();
	apiPost.mockResolvedValue(member({ status: "disabled" }));
	apiDelete.mockResolvedValue(undefined);
	navigations.length = 0;
	closed.length = 0;
	slots.length = 0;
	onRotated = undefined;
	client = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	// La lista del equipo: la mutación la invalida al salir bien.
	client.setQueryData(["staff", "list", BUSINESS_ID], [member()]);
});

// ─── Las acciones dependen del estado del acceso ─────────────────────────────

test("un acceso activo ofrece editar, rotar, pausar y dar de baja", () => {
	render(member());

	expect(button(strings.business.staff.edit)).toBeDefined();
	expect(button(strings.business.staff.actionRotate)).toBeDefined();
	expect(button(strings.business.staff.actionPause)).toBeDefined();
	expect(button(strings.business.staff.actionRemove)).toBeDefined();
});

test("un acceso pausado ofrece reactivar y dar de baja, y nada más", () => {
	render(member({ status: "disabled" }));

	expect(button(strings.business.staff.actionReactivate)).toBeDefined();
	expect(button(strings.business.staff.actionRemove)).toBeDefined();
	// Pausar un acceso pausado no es una acción: reactivarlo sí.
	expect(button(strings.business.staff.actionPause)).toBeUndefined();
	expect(button(strings.business.staff.actionRotate)).toBeUndefined();
	expect(button(strings.business.staff.edit)).toBeUndefined();
});

test("el dueño no tiene acciones: la propiedad se transfiere, no se administra", () => {
	// La hoja se monta DIRECTAMENTE con el dueño: aunque la tarjeta no ofrezca
	// el botón, aquí no hay ninguna acción.
	render(member({ role: "owner" }));

	expect(buttons).toHaveLength(0);
	expect(html).not.toContain(strings.business.staff.actionRotate);
	expect(html).not.toContain(strings.business.staff.actionRemove);
});

// ─── La transferencia de la propiedad ─────────────────────────────────────────
//
// La transferencia la pide el DUEÑO, y no cualquiera: la base exige que
// quien llama sea el dueño vivo del negocio. Y el receptor tiene que ser un
// acceso ACTIVO: la base rechaza un acceso pausado o dado de baja.

test("el dueño ve la transferencia de la propiedad", () => {
	renderWith(member(), "owner");

	expect(button(strings.business.staff.transferTrigger)).toBeDefined();
});

test("un gerente no ve la transferencia: la propiedad no es suya", () => {
	renderWith(member(), "manager");

	expect(button(strings.business.staff.transferTrigger)).toBeUndefined();
});

test("un rol que todavía no se sabe no ve la transferencia", () => {
	// La puerta se cierra por defecto: mientras no se sepa quién mira, la
	// transferencia no se ofrece.
	renderWith(member(), undefined);

	expect(button(strings.business.staff.transferTrigger)).toBeUndefined();
});

test("un acceso pausado no puede recibir la propiedad", () => {
	renderWith(member({ status: "disabled" }), "owner");

	expect(button(strings.business.staff.transferTrigger)).toBeUndefined();
});

test("al pulsar la transferencia se abre la hoja con el nombre del acceso", () => {
	renderWith(member({ label: "Luis Vega" }), "owner");
	button(strings.business.staff.transferTrigger)?.onPress?.();
	renderWith(member({ label: "Luis Vega" }), "owner");

	// La hoja de transferencia SUSTITUYE a la de acciones: son dos modales y
	// sólo uno puede estar abierto.
	expect(html).toContain("Luis Vega");
	expect(html).toContain(strings.business.staff.transferTitle);
	expect(html).not.toContain(strings.business.staff.actionsTitle);
});

// ─── Rotar el PIN ────────────────────────────────────────────────────────────

test("rotar el PIN pide confirmación y sale con POST .../rotate", async () => {
	apiPost.mockResolvedValue(CARD);
	const rotated: BusinessMemberDeliveryCardDto[] = [];
	onRotated = (card) => rotated.push(card);

	render(member());
	button(strings.business.staff.actionRotate)?.onPress?.();
	render(member());

	// La confirmación dice qué pasa y qué NO pasa.
	expect(dialog.title).toBe(
		strings.business.staff.rotateTitle.replace("{name}", "Ana Torres"),
	);
	expect(dialog.description).toContain("El PIN anterior deja de valer");
	expect(dialog.description).toContain("las sesiones abiertas siguen vivas");

	// Antes de confirmar no sale NADA por la red.
	expect(apiPost).toHaveBeenCalledTimes(0);

	dialog.confirm?.onPress?.();
	await flush();

	expect(apiPost).toHaveBeenCalledTimes(1);
	expect(apiPost.mock.calls[0]?.[0]).toBe(
		`/businesses/${BUSINESS_ID}/staff/${MEMBER_ID}/rotate`,
	);
	// Y rotar NO corta las sesiones: pausar es otra acción, con su propio
	// botón y su propia ruta.
	expect(apiPost.mock.calls.map((call) => call[0])).not.toContain(
		`/businesses/${BUSINESS_ID}/staff/${MEMBER_ID}/disable`,
	);

	// La tarjeta nueva se muestra con su aviso: es la MISMA tarjeta de entrega.
	render(member());
	expect(html).toContain(CARD.alias);
	expect(html).toContain(CARD.pin);
	expect(html).toContain(strings.business.staff.deliveryPinWarning);
	expect(sheetProps?.title).toBe(strings.business.staff.deliveryTitle);

	// Y quien montó la hoja se entera de la rotación.
	expect(rotated).toEqual([CARD]);
});

test("cerrar la tarjeta rotada cierra la hoja de acciones y no navega", async () => {
	apiPost.mockResolvedValue(CARD);

	render(member());
	button(strings.business.staff.actionRotate)?.onPress?.();
	render(member());
	dialog.confirm?.onPress?.();
	await flush();
	render(member());

	// El botón de la tarjeta de entrega cierra TODO: la tarjeta y la hoja de
	// acciones. Y NO se navega: la persona se queda en el equipo.
	button(strings.business.staff.deliveryClose)?.onPress?.();

	expect(closed).toEqual(["close"]);
	expect(navigations).toEqual([]);
});

// ─── Pausar ──────────────────────────────────────────────────────────────────

test("pausar pide confirmación y sale con POST .../disable", async () => {
	render(member());
	button(strings.business.staff.actionPause)?.onPress?.();
	render(member());

	// El corte es AHORA, y con él se van las sesiones de tablet.
	expect(dialog.description).toContain("se corta ahora");
	expect(dialog.description).toContain("sesiones de tablet");

	expect(apiPost).toHaveBeenCalledTimes(0);

	dialog.confirm?.onPress?.();
	await flush();

	expect(apiPost).toHaveBeenCalledTimes(1);
	expect(apiPost.mock.calls[0]?.[0]).toBe(
		`/businesses/${BUSINESS_ID}/staff/${MEMBER_ID}/disable`,
	);
	// Y la hoja se cierra: el acceso ya está pausado.
	expect(closed).toEqual(["close"]);
});

// ─── Reactivar ───────────────────────────────────────────────────────────────

test("reactivar pide confirmación y sale con POST .../enable", async () => {
	render(member({ status: "disabled" }));
	button(strings.business.staff.actionReactivate)?.onPress?.();
	render(member({ status: "disabled" }));

	expect(dialog.description).toContain("entrar con su PIN");
	expect(apiPost).toHaveBeenCalledTimes(0);

	dialog.confirm?.onPress?.();
	await flush();

	expect(apiPost).toHaveBeenCalledTimes(1);
	expect(apiPost.mock.calls[0]?.[0]).toBe(
		`/businesses/${BUSINESS_ID}/staff/${MEMBER_ID}/enable`,
	);
	expect(closed).toEqual(["close"]);
});

// ─── Dar de baja ─────────────────────────────────────────────────────────────

test("dar de baja pide confirmación y sale con DELETE .../:memberId", async () => {
	render(member());
	button(strings.business.staff.actionRemove)?.onPress?.();
	render(member());

	// La baja dice lo que NO se puede recuperar.
	expect(dialog.title).toContain(strings.business.staff.actionRemove);
	expect(dialog.description).toContain(
		"no puede volver a entrar hasta que se le dé un acceso nuevo",
	);
	expect(dialog.description).toContain("el alias no se recicla");

	expect(apiDelete).toHaveBeenCalledTimes(0);

	dialog.confirm?.onPress?.();
	await flush();

	expect(apiDelete).toHaveBeenCalledTimes(1);
	expect(apiDelete.mock.calls[0]?.[0]).toBe(
		`/businesses/${BUSINESS_ID}/staff/${MEMBER_ID}`,
	);
	expect(closed).toEqual(["close"]);
});

// ─── El botón que confirma ───────────────────────────────────────────────────

test("la baja se confirma con un botón destructivo y las otras no", () => {
	// La baja es la única de las cuatro que destruye: su botón lo dice con el
	// color, igual que el «Dar de baja» de la hoja.
	render(member());
	button(strings.business.staff.actionRemove)?.onPress?.();
	render(member());

	expect(dialog.confirm?.label).toBe(strings.business.staff.actionRemove);
	expect(dialog.confirm?.style).toEqual({
		backgroundColor: light.destructive,
	});
	// Y el TEXTO del botón tiene que contrastar con ese fondo: el color de
	// por defecto del botón (`primaryForeground`) es casi negro en modo
	// oscuro y sobre el fondo de la baja no se lee.
	expect(dialog.confirm?.labelStyle).toEqual({
		color: light.destructiveForeground,
	});

	// Y las otras tres no lo llevan: pausar, reactivar y rotar se deshacen.
	render(member());
	button(strings.business.staff.actionPause)?.onPress?.();
	render(member());

	expect(dialog.confirm?.label).toBe(strings.business.staff.actionPause);
	expect(dialog.confirm?.style).toBeUndefined();
	// Su texto es el de siempre: el del botón normal.
	expect(dialog.confirm?.labelStyle).toBeUndefined();
});

// ─── Los fallos y los aciertos ───────────────────────────────────────────────

test("una acción rechazada se pinta con la prosa del API y deja la hoja abierta", async () => {
	apiPost.mockRejectedValue(
		Errors.businessRule("Tu plan no admite otro acceso.", "R0001"),
	);

	render(member());
	button(strings.business.staff.actionPause)?.onPress?.();
	render(member());
	dialog.confirm?.onPress?.();
	await flush();

	render(member());

	// El motivo lo escribió el API: la app no lo tapa.
	expect(html).toContain("Tu plan no admite otro acceso.");
	// Y se pinta con el rojo de la casa: el `destructive` oscuro no se lee
	// sobre la superficie de la hoja.
	expect(textStyle("Tu plan no admite otro acceso.")).toEqual({
		color: light.destructiveVibrant,
	});
	// Y la hoja sigue abierta: la persona puede leerlo y reintentar.
	expect(closed).toEqual([]);
});

test("una acción correcta invalida la lista del equipo", async () => {
	render(member());
	button(strings.business.staff.actionPause)?.onPress?.();
	render(member());
	dialog.confirm?.onPress?.();
	await flush();

	expect(
		client.getQueryState(["staff", "list", BUSINESS_ID])?.isInvalidated,
	).toBe(true);
});

test("cancelar la confirmación no llama al API", async () => {
	render(member());
	button(strings.business.staff.actionPause)?.onPress?.();
	render(member());

	expect(dialog.cancel?.label).toBe(strings.common.cancel);

	// Cerrar la ventana sin confirmar es lo mismo que cancelar.
	dialog.onOpenChange?.(false);
	render(member());

	expect(apiPost).toHaveBeenCalledTimes(0);
	expect(dialog.open).toBe(false);
});

test("editar lleva a la pantalla del acceso y cierra la hoja", () => {
	render(member());
	button(strings.business.staff.edit)?.onPress?.();

	expect(navigations).toEqual([
		`/business/${BUSINESS_ID}/staff/${MEMBER_ID}/edit`,
	]);
	expect(closed).toEqual(["close"]);
});
