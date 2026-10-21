import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import {
	businessMemberAliasWarnings,
	type BusinessLocation,
} from "@0xc1x/role-commons";
import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import type { StaffFormValues } from "./StaffForm";

/**
 * El formulario del alta de un acceso (§9.2).
 *
 * Lo que se afirma aquí son los CONTRATOS del formulario, no su pintura:
 *
 *  1. No se envía sin nombre, ni sin al menos una sucursal.
 *  2. El modo persistente —«sin expiración»— NO se ofrece para un empleado:
 *     es sólo del gerente, y el API lo rechaza para el cajero.
 *  3. Las sucursales se marcan con `Checkbox` y lo marcado es lo que viaja.
 *  4. El alias vacío NO viaja: su ausencia es lo que hace que el servidor lo
 *     proponga.
 *  5. El aviso del dominio lo contesta commons, y aparece mientras se escribe.
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

interface ViewProps {
	accessibilityRole?: string;
	children?: ReactNode;
}

let fields: FieldProps[] = [];
let buttons: ButtonProps[] = [];
let checkboxes: CheckProps[] = [];
let switches: CheckProps[] = [];
let radios: PressProps[] = [];
let radioGroups: ViewProps[] = [];
let html = "";

/**
 * Los textos pintados, con su prosa y su `style`.
 *
 * El `style` es lo que se mira para la SEVERIDAD: un aviso que se pinta con
 * el rojo de un fallo está mintiendo, porque el acceso se puede guardar
 * igual.
 */
interface TextProbe {
	text: string;
	style?: unknown;
}
let texts: TextProbe[] = [];

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

const ProbePressable = (props: PressProps) => {
	if (props.accessibilityRole === "radio") radios.push(props);
	return createElement(nativeWeb.View, null, props.children);
};

const ProbeView = (props: ViewProps) => {
	if (props.accessibilityRole === "radiogroup") radioGroups.push(props);
	return createElement(nativeWeb.View, null, props.children);
};

mockNativeUi({ Pressable: ProbePressable, View: ProbeView });

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
	AppText: (props: { children?: ReactNode; style?: unknown }) => {
		texts.push({ text: textOf(props.children), style: props.style });
		return createElement(nativeWeb.Text, null, props.children);
	},
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
// `setState` posterior no vuelve a pintar nada. Con el `useState` de React, los
// handlers de este test escribirían en el vacío y `submit` leería siempre el
// valor del primer render. El reemplazo guarda los valores en casillas que
// sobreviven entre renders, así que el ciclo escribir → volver a renderizar →
// leer es el mismo que en la app. El índice de casilla se reinicia en cada
// render, igual que el orden de hooks.
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

function render(
	props: {
		locations?: BusinessLocation[];
		submitting?: boolean;
		error?: string | null;
	} = {},
): void {
	hookCursor = 0;
	fields = [];
	buttons = [];
	checkboxes = [];
	switches = [];
	radios = [];
	radioGroups = [];
	texts = [];
	html = renderToStaticMarkup(
		createElement(StaffForm, {
			locations: props.locations ?? [CENTRO, SUR],
			submitting: props.submitting ?? false,
			error: props.error ?? null,
			onSubmit: (values: StaffFormValues) => submitted.push(values),
		}),
	);
}

const field = (label: string): FieldProps => {
	const found = fields.find((f) => f.label === label);
	if (!found) throw new Error(`campo no renderizado: ${label}`);
	return found;
};

const submitButton = (): ButtonProps => {
	const found = buttons.find(
		(button) => textOf(button.children) === strings.business.staff.createAccess,
	);
	if (!found) throw new Error("botón de alta no renderizado");
	return found;
};

const radio = (label: string): PressProps => {
	const found = radios.find((r) => textOf(r.children).includes(label));
	if (!found) throw new Error(`opción de rol no renderizada: ${label}`);
	return found;
};

const typeName = (text: string): void => {
	field(strings.business.staff.nameLabel).onChangeText?.(text);
	render();
};

const typeAlias = (text: string): void => {
	field(strings.business.staff.aliasLabel).onChangeText?.(text);
	render();
};

const checkLocation = (index: number): void => {
	checkboxes[index]?.onCheckedChange?.(true);
	render();
};

const chooseRole = (label: string): void => {
	radio(label).onPress?.();
	render();
};

const enablePersistentSession = (): void => {
	switches[0]?.onCheckedChange?.(true);
	render();
};

beforeEach(() => {
	submitted.length = 0;
	slots.length = 0;
	render();
});

// ─── Los contratos del formulario ────────────────────────────────────────────

test("no se puede enviar sin nombre", () => {
	expect(submitButton().disabled).toBe(true);

	typeName("Ana Torres");

	// El nombre ya está, pero la sucursal falta: sigue sin poder enviar.
	expect(submitButton().disabled).toBe(true);
});

test("no se puede enviar sin al menos una sucursal", () => {
	typeName("Ana Torres");

	expect(submitButton().disabled).toBe(true);

	checkLocation(0);

	expect(submitButton().disabled).toBe(false);
});

test("las sucursales se marcan con Checkbox y lo marcado es lo que viaja", () => {
	expect(checkboxes).toHaveLength(2);
	expect(checkboxes[0]?.checked).toBe(false);

	typeName("Ana Torres");
	checkLocation(1);

	expect(checkboxes[1]?.checked).toBe(true);
	expect(checkboxes[0]?.checked).toBe(false);

	submitButton().onPress?.();

	expect(submitted).toHaveLength(1);
	expect(submitted[0]?.business_location_ids).toEqual([SUR.id]);
	expect(submitted[0]?.label).toBe("Ana Torres");
});

test("con rol de empleado la sesión sin expiración no se ofrece", () => {
	// El cajero no puede dejar un acceso abierto para siempre: el modo
	// persistente es del gerente, y el API lo rechaza.
	expect(html).not.toContain(strings.business.staff.sessionNever);
	expect(html).toContain(strings.business.staff.sessionShifts);
	expect(switches).toHaveLength(0);
});

test("con rol de gerente la sesión sin expiración sí se ofrece", () => {
	chooseRole(strings.business.staff.roleManager);

	expect(html).toContain(strings.business.staff.sessionNever);
	expect(switches).toHaveLength(1);
});

test("el pie de la política de sesión dice la política efectiva", () => {
	// El pie no es una explicación fija: con el modo persistente dado, decir
	// «la sesión dura 24 horas» sería mentirle sobre lo que acaba de elegir.
	expect(html).toContain(strings.business.staff.sessionShiftsHint);
	expect(html).not.toContain(strings.business.staff.sessionPersistentHint);

	chooseRole(strings.business.staff.roleManager);
	enablePersistentSession();

	expect(html).toContain(strings.business.staff.sessionPersistentHint);
	expect(html).not.toContain(strings.business.staff.sessionShiftsHint);
});

test("las opciones de rol son un grupo de radios y el elegido lo dice", () => {
	expect(radioGroups).toHaveLength(1);

	const gerente = radio(strings.business.staff.roleManager);
	const empleado = radio(strings.business.staff.roleStaff);
	expect(gerente.accessibilityState?.checked).toBe(false);
	expect(empleado.accessibilityState?.checked).toBe(true);

	chooseRole(strings.business.staff.roleManager);

	expect(
		radio(strings.business.staff.roleManager).accessibilityState?.checked,
	).toBe(true);
	expect(
		radio(strings.business.staff.roleStaff).accessibilityState?.checked,
	).toBe(false);
});

test("la casilla de dentro de la fila no es un elemento de accesibilidad propio", () => {
	// La fila es el control —un checkbox con su nombre— y la casilla es el
	// dibujo: sin `accessible={false}` el VoiceOver anunciaría una casilla
	// suelta al lado de la fila que ya dice lo mismo.
	expect(checkboxes[0]?.accessible).toBe(false);
});

test("la sesión por turnos son 24 horas y la persistente es cero", () => {
	typeName("Ana Torres");
	checkLocation(0);

	submitButton().onPress?.();
	expect(submitted[0]?.session_ttl_hours).toBe(24);
	expect(submitted[0]?.role).toBe("staff");

	// El gerente puede elegir el modo persistente.
	chooseRole(strings.business.staff.roleManager);
	enablePersistentSession();
	submitButton().onPress?.();

	expect(submitted[1]?.session_ttl_hours).toBe(0);
	expect(submitted[1]?.role).toBe("manager");
});

test("bajar a empleado devuelve la política de por turnos aunque el interruptor siga dado", () => {
	chooseRole(strings.business.staff.roleManager);
	enablePersistentSession();
	chooseRole(strings.business.staff.roleStaff);

	typeName("Ana Torres");
	checkLocation(0);
	submitButton().onPress?.();

	expect(submitted[0]?.session_ttl_hours).toBe(24);
});

test("el alias vacío no viaja: lo propone el servidor", () => {
	typeName("Ana Torres");
	checkLocation(0);
	submitButton().onPress?.();

	expect(submitted[0]?.alias).toBeUndefined();
	expect(Object.keys(submitted[0] ?? {})).not.toContain("alias");
});

test("el alias escrito viaja tal cual", () => {
	typeName("Ana Torres");
	typeAlias("ana@panaderia.role.ec");
	checkLocation(0);
	submitButton().onPress?.();

	expect(submitted[0]?.alias).toBe("ana@panaderia.role.ec");
});

test("un alias que no es correo no deja enviar", () => {
	typeName("Ana Torres");
	typeAlias("ana");
	checkLocation(0);

	expect(field(strings.business.staff.aliasLabel).error).toBe(
		strings.business.staff.aliasInvalid,
	);
	expect(submitButton().disabled).toBe(true);
});

test("el aviso del dominio aparece con un alias de dominio propio y no con uno de Rolé", () => {
	typeAlias("ana@panaderialafamilia.ec");

	expect(html).toContain(strings.business.staff.aliasWarning);

	// Un alias de la plataforma no avisa de nada: la regla la contesta
	// commons, y el formulario no la reimplementa.
	typeAlias("ana@panaderia.role.ec");
	expect(html).not.toContain(strings.business.staff.aliasWarning);

	// Y el ápice tampoco.
	typeAlias("ana@role.ec");
	expect(html).not.toContain(strings.business.staff.aliasWarning);
});

test("el error del servidor se pinta con su prosa", () => {
	render({ error: "Tu plan no admite otro acceso." });

	expect(html).toContain("Tu plan no admite otro acceso.");
});

test("el aviso del dominio lleva el ámbar de la casa, no el rojo de un fallo", () => {
	typeAlias("ana@panaderialafamilia.ec");

	// Es un AVISO: el alta se puede enviar igual, y el dominio es un dato que
	// la persona escribe. Pintarlo con el rojo de un fallo engaña.
	expect(textStyle(strings.business.staff.aliasWarning)).toEqual({
		color: light.warningText,
	});
});

test("el error del alta lleva la prosa del error, que sí se lee", () => {
	render({ error: "Tu plan no admite otro acceso." });

	// Un ERROR sí es un error: lleva el rojo de la prosa (`destructiveText`),
	// el único rojo que pasa AA sobre la tarjeta del formulario.
	expect(textStyle("Tu plan no admite otro acceso.")).toEqual({
		color: light.destructiveText,
	});
});

test("mientras se envía, el botón no se puede volver a tocar", () => {
	render({ submitting: true });

	expect(submitButton().disabled).toBe(true);
	expect(submitButton().loading).toBe(true);
});
