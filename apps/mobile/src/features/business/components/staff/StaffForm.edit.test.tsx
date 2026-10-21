import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import {
	businessMemberAliasWarnings,
	type BusinessLocation,
	type StaffAliasWarningCode,
} from "@0xc1x/role-commons";
import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import type { StaffFormInitial, StaffFormValues } from "./StaffForm";

/**
 * El formulario en modo EDICIÓN (§9.2).
 *
 * Lo que se afirma aquí son las DIFERENCIAS con el alta, porque son las que
 * se pueden equivocar sin que se note:
 *
 *  1. Los valores con los que llega el acceso están puestos: el alias, el
 *     alcance y el rol.
 *  2. El nombre NO se edita: se muestra como texto, y no hay campo.
 *  3. El alias NO puede quedar vacío: «vacío = lo propone el servidor» es
 *     una regla del ALTA.
 *  4. El aviso del §9.4 lo cuenta el API: con un alias de dominio propio y
 *     sin avisos del servidor NO se pinta nada, y con los avisos que él
 *     devolvió se pintan.
 *  5. El `0` de la sesión es «sin expiración»; cualquier otro valor es la
 *     política de por turnos.
 */

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

function location(id: string, name: string): BusinessLocation {
	return {
		id,
		business_id: BUSINESS_ID,
		name,
		address: "Av. Siempre Viva 742",
		phone: null,
		latitude: -0.22,
		longitude: -78.52,
		is_active: true,
		zone: null,
		is_headquarter: false,
		created_at: "2026-10-01T10:00:00.000Z",
		updated_at: "2026-10-01T10:00:00.000Z",
	};
}

const CENTRO = location("44444444-4444-4444-8444-444444444444", "Centro");
const SUR = location("55555555-5555-4555-8555-555555555555", "Sur");

// ─── Las sondas ──────────────────────────────────────────────────────────────

interface FieldProps {
	label?: string;
	value?: string;
	error?: string | null;
	onChangeText?: (text: string) => void;
}

interface ButtonProps {
	children?: ReactNode;
	onPress?: () => void;
	disabled?: boolean;
	loading?: boolean;
}

interface CheckProps {
	checked?: boolean;
	accessible?: boolean;
	onCheckedChange?: (checked: boolean) => void;
}

interface PressProps {
	accessibilityRole?: string;
	accessibilityState?: { checked?: boolean; selected?: boolean };
	children?: ReactNode;
	onPress?: () => void;
}

let fields: FieldProps[] = [];
let buttons: ButtonProps[] = [];
let checkboxes: CheckProps[] = [];
let switches: CheckProps[] = [];
let radios: PressProps[] = [];
let html = "";

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

const ProbePressable = (props: PressProps) => {
	if (props.accessibilityRole === "radio") radios.push(props);
	return createElement(nativeWeb.View, null, props.children);
};

mockNativeUi({ Pressable: ProbePressable });

// `nativewind` arrastra su `doctor` —que es un script de Node, no un módulo— y
// bun no lo parsea. Lo que hace falta de él aquí es `cssInterop`, que el
// `Icon` de la casilla llama al importarse.
mock.module("nativewind", () => ({
	cssInterop: () => {},
}));

// `@rn-primitives/checkbox` y `@rn-primitives/switch` publican su JSX en un
// `.mjs` que bun no parsea. Se sustituyen los PRIMITIVOS —no el envoltorio de
// la app— para que lo que se observa es lo que el formulario le pasó al
// `Checkbox` y al `Switch` de verdad.
mock.module("@rn-primitives/checkbox", () => ({
	Root: (props: CheckProps & { children?: ReactNode }) => {
		checkboxes.push(props);
		return createElement(nativeWeb.View, null, props.children);
	},
	Indicator: (props: { children?: ReactNode }) =>
		createElement(nativeWeb.View, null, props.children),
}));

mock.module("@rn-primitives/switch", () => ({
	Root: (props: CheckProps & { children?: ReactNode }) => {
		switches.push(props);
		return createElement(nativeWeb.View, null, props.children);
	},
	Thumb: () => createElement(nativeWeb.View, null),
}));

mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));

mock.module("@/src/core/ui", () => ({
	AppText: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.Text, null, children),
	TextField: (props: FieldProps) => {
		fields.push(props);
		return createElement(
			nativeWeb.Text,
			null,
			`${props.label ?? ""}: ${props.value ?? ""}`,
		);
	},
}));

mock.module("@/components/ui/button", () => ({
	Button: (props: ButtonProps) => {
		buttons.push(props);
		return createElement(nativeWeb.Text, null, props.children);
	},
}));

// El módulo de los accesos arrastra el cliente HTTP —que llega al cliente de
// Supabase y de ahí a `react-native`, que bun no parsea—. Se sustituye SÓLO la
// frontera: la regla del aviso entra de verdad, desde commons.
mock.module("@/src/features/business/data/staff", () => ({
	aliasWarnings: (alias: string) => businessMemberAliasWarnings(alias),
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

const { StaffForm } = await import("./StaffForm");

// ─── El render ───────────────────────────────────────────────────────────────

const submitted: StaffFormValues[] = [];

/** El acceso con el que el formulario llega pintado. */
const INITIAL: StaffFormInitial = {
	label: "Ana Torres",
	role: "staff",
	business_location_ids: [CENTRO.id],
	session_ttl_hours: 24,
	alias: "ana@panaderia.role.ec",
};

/**
 * Las props con las que está pintado el formulario AHORA.
 *
 * Un re-render conserva las props —como en la app—: por eso `typeAlias` puede
 * seguir pintando el mismo formulario con los mismos avisos del servidor.
 */
let currentProps: {
	initial: StaffFormInitial;
	aliasWarnings?: StaffAliasWarningCode[];
	aliasWarningsFor?: string;
	locations: BusinessLocation[];
} = { initial: INITIAL, locations: [CENTRO, SUR] };

function render(
	props: Partial<typeof currentProps> = {},
): void {
	currentProps = { ...currentProps, ...props };
	hookCursor = 0;
	fields = [];
	buttons = [];
	checkboxes = [];
	switches = [];
	radios = [];
	html = renderToStaticMarkup(
		createElement(StaffForm, {
			locations: currentProps.locations,
			initial: currentProps.initial,
			aliasWarnings: currentProps.aliasWarnings,
			aliasWarningsFor: currentProps.aliasWarningsFor,
			submitting: false,
			error: null,
			onSubmit: (values: StaffFormValues) => submitted.push(values),
		}),
	);
}

/**
 * Monta el formulario DE NUEVO.
 *
 * Los valores con los que llega el acceso se leen UNA vez, al montarse: un
 * re-render con otros valores no los cambia, igual que en la app. Por eso
 * este helper tira las casillas del estado antes de pintar.
 */
function mount(props: Partial<typeof currentProps> = {}): void {
	slots.length = 0;
	render(props);
}

const field = (label: string): FieldProps | undefined =>
	fields.find((f) => f.label === label);

const submitButton = (): ButtonProps => {
	const found = buttons.find(
		(button) => textOf(button.children) === strings.business.staff.saveChanges,
	);
	if (!found) throw new Error("botón de guardar no renderizado");
	return found;
};

const radio = (label: string): PressProps => {
	const found = radios.find((r) => textOf(r.children).includes(label));
	if (!found) throw new Error(`opción de rol no renderizada: ${label}`);
	return found;
};

const typeAlias = (text: string): void => {
	field(strings.business.staff.aliasLabel)?.onChangeText?.(text);
	render();
};

beforeEach(() => {
	submitted.length = 0;
	slots.length = 0;
	currentProps = { initial: INITIAL, locations: [CENTRO, SUR] };
	mount();
});

// ─── Los valores con los que llega ───────────────────────────────────────────

test("el formulario llega con el alias, el alcance y el rol del acceso", () => {
	expect(field(strings.business.staff.aliasLabel)?.value).toBe(
		"ana@panaderia.role.ec",
	);
	expect(checkboxes[0]?.checked).toBe(true);
	expect(checkboxes[1]?.checked).toBe(false);
	expect(
		radio(strings.business.staff.roleStaff).accessibilityState?.checked,
	).toBe(true);
});

test("el nombre se MUESTRA y no se edita: no hay campo de nombre", () => {
	// Ninguna de las nueve rutas del §8 renombra a nadie: un campo editable
	// aquí sería una puerta por donde entra un cambio que el API ni acepta.
	expect(field(strings.business.staff.nameLabel)).toBeUndefined();
	expect(html).toContain("Ana Torres");
	expect(html).toContain(strings.business.staff.nameReadOnly);
});

test("el botón dice que guarda y no que crea", () => {
	expect(textOf(submitButton().children)).toBe(
		strings.business.staff.saveChanges,
	);
	expect(
		buttons.some(
			(button) =>
				textOf(button.children) === strings.business.staff.createAccess,
		),
	).toBe(false);
});

// ─── El alias no puede quedar vacío ──────────────────────────────────────────

test("el alias no puede quedar vacío en la edición", () => {
	// «Vacío = lo propone el servidor» es una regla del ALTA: aquí el alias
	// ya existe y es con lo que la persona entra.
	typeAlias("");

	expect(field(strings.business.staff.aliasLabel)?.error).toBe(
		strings.business.staff.aliasRequired,
	);
	expect(submitButton().disabled).toBe(true);
});

test("un alias que no es correo no deja guardar", () => {
	typeAlias("ana");

	expect(field(strings.business.staff.aliasLabel)?.error).toBe(
		strings.business.staff.aliasInvalid,
	);
	expect(submitButton().disabled).toBe(true);
});

test("el recordatorio de que el servidor propone el alias es del alta", () => {
	expect(html).not.toContain(strings.business.staff.aliasHint);
	expect(html).toContain(strings.business.staff.aliasEditHint);
});

// ─── El aviso lo cuenta el API ───────────────────────────────────────────────

test("un alias de dominio propio NO avisa si el API no lo dijo", () => {
	typeAlias("ana@panaderialafamilia.ec");

	// En la EDICIÓN el aviso no se calcula en el cliente: lo que se pinta es
	// lo que el servidor devolvió, y aquí no devolvió nada.
	expect(html).not.toContain(strings.business.staff.aliasWarning);
});

test("el aviso que devuelve el API se pinta", () => {
	typeAlias("ana@panaderialafamilia.ec");
	render({
		aliasWarnings: ["alias_domain_can_receive_mail"],
		aliasWarningsFor: "ana@panaderialafamilia.ec",
	});

	expect(html).toContain(strings.business.staff.aliasWarning);
});

test("el aviso del servidor deja de pintarse cuando se escribe otro alias", () => {
	typeAlias("ana@panaderialafamilia.ec");
	render({
		aliasWarnings: ["alias_domain_can_receive_mail"],
		aliasWarningsFor: "ana@panaderialafamilia.ec",
	});
	expect(html).toContain(strings.business.staff.aliasWarning);

	// El aviso era de ESE alias: con otro escrito ya no habla de lo que hay
	// en el campo, y mostrarlo sería mentarle.
	typeAlias("otra@panaderialafamilia.ec");
	expect(html).not.toContain(strings.business.staff.aliasWarning);
});

// ─── El alcance vacío ────────────────────────────────────────────────────────

test("un alcance vacío se puede guardar en la edición", () => {
	mount({ initial: { ...INITIAL, business_location_ids: [] } });

	// El aviso se DICE —sin sucursales el acceso no alcanza ninguna (§5.1)—
	// pero no impide guardar: obligar a marcar una sería regalar un permiso
	// sin que nadie lo pidiera.
	expect(html).toContain(strings.business.staff.noLocationsWarning);
	expect(submitButton().disabled).toBe(false);

	submitButton().onPress?.();

	expect(submitted[0]?.business_location_ids).toEqual([]);
});

// ─── La política de sesión ───────────────────────────────────────────────────

test("el cero de la sesión es «sin expiración» y el interruptor llega dado", () => {
	mount({
		initial: { ...INITIAL, role: "manager", session_ttl_hours: 0 },
	});

	expect(switches).toHaveLength(1);
	expect(switches[0]?.checked).toBe(true);
	expect(html).toContain(strings.business.staff.sessionPersistentHint);
});

test("una sesión de por turnos llega con el interruptor apagado", () => {
	mount({ initial: { ...INITIAL, role: "manager", session_ttl_hours: 24 } });

	expect(switches).toHaveLength(1);
	expect(switches[0]?.checked).toBe(false);
	expect(html).toContain(strings.business.staff.sessionShiftsHint);
});

test("bajar a empleado devuelve la política de por turnos", () => {
	mount({ initial: { ...INITIAL, role: "manager", session_ttl_hours: 0 } });

	radio(strings.business.staff.roleStaff).onPress?.();
	render();

	expect(switches).toHaveLength(0);
	expect(html).toContain(strings.business.staff.sessionShiftsHint);
});

// ─── Lo que se guarda ────────────────────────────────────────────────────────

test("lo que se guarda lleva el nombre, el rol, el alcance y la política", () => {
	radio(strings.business.staff.roleManager).onPress?.();
	render();

	submitButton().onPress?.();

	expect(submitted).toHaveLength(1);
	expect(submitted[0]).toEqual({
		label: "Ana Torres",
		role: "manager",
		business_location_ids: [CENTRO.id],
		session_ttl_hours: 24,
		alias: "ana@panaderia.role.ec",
	});
});
