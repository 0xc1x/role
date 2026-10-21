import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import type {
	BusinessLocation,
	BusinessMemberDto,
	StaffAliasWarningCode,
	UpdateBusinessMemberAliasResponseDto,
} from "@0xc1x/role-commons";
import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { Errors } from "@/src/core/error/app-error";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import type { StaffFormValues } from "./StaffForm";

/**
 * La pantalla de la edición de un acceso (§9.2) — la parte que decide el ORDEN.
 *
 * Lo que se afirma aquí:
 *
 *  1. El `PATCH` del acceso lleva EXACTAMENTE el rol, la política y el
 *     alcance: ni el nombre (que no se renombra) ni el alias (que tiene su
 *     propia ruta).
 *  2. El alias se cambia en una SEGUNDA llamada, y sólo si la primera tuvo
 *     éxito y el alias cambió.
 *  3. Un fallo del rol NO toca el alias; un fallo del alias deja la pantalla
 *     abierta con el acceso ya actualizado.
 *  4. El aviso del §9.4 lo cuenta el API: la pantalla pasa al formulario lo
 *     que él devolvió, y no calcula ninguno.
 *  5. El dueño no se edita, y un acceso que no está en la lista no se pinta.
 */

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";

const CENTRO: BusinessLocation = {
	id: "44444444-4444-4444-8444-444444444444",
	business_id: BUSINESS_ID,
	name: "Centro",
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

function member(overrides: Partial<BusinessMemberDto> = {}): BusinessMemberDto {
	return {
		id: MEMBER_ID,
		business_id: BUSINESS_ID,
		user_id: "33333333-3333-4333-8333-333333333333",
		role: "staff",
		label: "Ana Torres",
		alias: "ana@panaderia.role.ec",
		status: "active",
		session_ttl_hours: 24,
		business_location_ids: [CENTRO.id],
		last_authenticated_at: null,
		created_at: "2026-10-01T10:00:00.000Z",
		updated_at: "2026-10-01T10:00:00.000Z",
		deleted_at: null,
		...overrides,
	};
}

// ─── Las sondas ──────────────────────────────────────────────────────────────

interface FormProps {
	locations: BusinessLocation[];
	initial?: {
		label: string;
		role: "manager" | "staff";
		business_location_ids: string[];
		session_ttl_hours: number;
		alias: string;
	};
	aliasWarnings?: StaffAliasWarningCode[];
	aliasWarningsFor?: string;
	submitting: boolean;
	error: string | null;
	onSubmit: (values: StaffFormValues) => void;
}

interface ErrorStateProps {
	error: unknown;
	onRetry?: () => void;
}

/** Las props con las que se pintó el formulario. */
let formProps: FormProps | null = null;
/** Los estados de error pintados. */
let errorStates: ErrorStateProps[] = [];
/** Los avisos que se pintaron. */
const toasts: Array<{ kind: "success" | "error"; message: string }> = [];
/**
 * A dónde se ha navegado en este test.
 *
 * La pantalla NO navega al guardar —se queda con el aviso del §9.4— y esta
 * sonda lo afirma: si algún día alguien le pone una navegación, el mock de
 * `expo-router` la registra y el test falla.
 */
const navigations: Array<{
	kind: "push" | "replace" | "navigate";
	path: string;
}> = [];

interface UpdateCall {
	memberId: string;
	body: unknown;
	options: {
		onSuccess?: (data: unknown) => void;
		onError?: (error: unknown) => void;
	};
}
const updateCalls: UpdateCall[] = [];

interface AliasCall {
	memberId: string;
	alias: string;
	options: {
		onSuccess?: (data: UpdateBusinessMemberAliasResponseDto) => void;
		onError?: (error: unknown) => void;
	};
}
const aliasCalls: AliasCall[] = [];

const updateDouble = {
	mutate: (
		vars: { memberId: string; body: unknown },
		options: {
			onSuccess?: (data: unknown) => void;
			onError?: (error: unknown) => void;
		},
	) => {
		updateCalls.push({ memberId: vars.memberId, body: vars.body, options });
	},
	isPending: false,
};

const updateAliasDouble = {
	mutate: (
		vars: { memberId: string; alias: string },
		options: {
			onSuccess?: (data: UpdateBusinessMemberAliasResponseDto) => void;
			onError?: (error: unknown) => void;
		},
	) => {
		aliasCalls.push({ memberId: vars.memberId, alias: vars.alias, options });
	},
	isPending: false,
};

/** La lista de accesos que devuelve la consulta. */
let staffQuery: {
	data: BusinessMemberDto[] | undefined;
	isLoading: boolean;
	isError: boolean;
	error: unknown;
} = {
	data: [member()],
	isLoading: false,
	isError: false,
	error: null,
};

/** Cuántas veces se reintentó la lista del equipo. */
let membersRefetchCalls = 0;

mockNativeUi();

// El router se dobla para que la ausencia de navegación sea una AFIRMACIÓN y
// no un accidente: si la pantalla importara `router` para irse al guardar,
// esta sonda lo vería.
mock.module("expo-router", () => ({
	router: {
		push: (path: string) => navigations.push({ kind: "push", path }),
		replace: (path: string) => navigations.push({ kind: "replace", path }),
		navigate: (path: string) => navigations.push({ kind: "navigate", path }),
	},
}));

mock.module("sonner-native", () => ({
	toast: {
		success: (message: string) => toasts.push({ kind: "success", message }),
		error: (message: string) => toasts.push({ kind: "error", message }),
	},
}));

mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));

mock.module("@/src/core/ui", () => ({
	AppText: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.Text, null, children),
	Screen: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.View, null, children),
	ScreenHeader: ({ title }: { title?: string }) =>
		createElement(nativeWeb.Text, null, title),
	ErrorState: (props: ErrorStateProps) => {
		errorStates.push(props);
		return createElement(nativeWeb.Text, null, "ERROR_STATE");
	},
}));

mock.module("@/components/ui/skeleton", () => ({
	Skeleton: () => createElement(nativeWeb.Text, null, "SKELETON"),
}));

mock.module("@/src/features/business/hooks", () => ({
	useBusinessLocations: () => ({
		data: [CENTRO],
		isLoading: false,
		isError: false,
		error: null,
		// El reintento de las SUCURSALES no se cuenta: lo que este fichero
		// afirma es el de la lista del equipo.
		refetch: () => {},
	}),
	useStaffMembers: () => ({
		...staffQuery,
		refetch: () => {
			membersRefetchCalls += 1;
		},
	}),
	useStaffMutations: () => ({
		update: updateDouble,
		updateAlias: updateAliasDouble,
	}),
}));

// El formulario se dobla para poder observar lo que la pantalla le pasa: el
// aviso del §9.4 y el cuerpo del `PATCH` son lo que hay que afirmar, y eso se
// ve desde la pantalla, no desde el formulario.
mock.module("./StaffForm", () => ({
	StaffForm: (props: FormProps) => {
		formProps = props;
		return createElement(nativeWeb.Text, null, "STAFF_FORM");
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

const { StaffEditScreen } = await import("./StaffEditScreen");

// ─── El render ───────────────────────────────────────────────────────────────

let html = "";

function render(
	businessId: string = BUSINESS_ID,
	memberId: string = MEMBER_ID,
) {
	hookCursor = 0;
	formProps = null;
	errorStates = [];
	html = renderToStaticMarkup(
		createElement(StaffEditScreen, { businessId, memberId }),
	);
}

/** Los valores que el formulario entrega al guardar. */
const VALUES: StaffFormValues = {
	label: "Ana Torres",
	role: "manager",
	business_location_ids: [CENTRO.id],
	session_ttl_hours: 0,
	alias: "ana@panaderialafamilia.ec",
};

/** La respuesta del API al cambio de alias. */
function aliasResponse(
	aliasWarnings: StaffAliasWarningCode[] = [],
): UpdateBusinessMemberAliasResponseDto {
	return { member: member(), alias_warnings: aliasWarnings };
}

beforeEach(() => {
	toasts.length = 0;
	navigations.length = 0;
	updateCalls.length = 0;
	aliasCalls.length = 0;
	slots.length = 0;
	membersRefetchCalls = 0;
	staffQuery = {
		data: [member()],
		isLoading: false,
		isError: false,
		error: null,
	};
	render();
});

// ─── El cuerpo del PATCH ─────────────────────────────────────────────────────

test("el cuerpo del PATCH lleva el rol, la política y el alcance, y nada más", () => {
	formProps?.onSubmit(VALUES);

	expect(updateCalls).toHaveLength(1);
	expect(updateCalls[0]?.memberId).toBe(MEMBER_ID);
	expect(updateCalls[0]?.body).toEqual({
		role: "manager",
		session_ttl_hours: 0,
		business_location_ids: [CENTRO.id],
	});
	// Ni el nombre —que no se renombra— ni el alias —que tiene su ruta—.
	expect(Object.keys((updateCalls[0]?.body ?? {}) as object)).toEqual([
		"role",
		"session_ttl_hours",
		"business_location_ids",
	]);
});

test("el formulario llega con los valores del acceso y sin avisos", () => {
	expect(formProps?.initial).toEqual({
		label: "Ana Torres",
		role: "staff",
		business_location_ids: [CENTRO.id],
		session_ttl_hours: 24,
		alias: "ana@panaderia.role.ec",
	});
	expect(formProps?.aliasWarnings).toEqual([]);
});

// ─── El orden de las dos llamadas ────────────────────────────────────────────

test("el alias se cambia en una segunda llamada, después de la primera", () => {
	formProps?.onSubmit(VALUES);

	// Todavía no: la primera llamada tiene que salir bien.
	expect(updateCalls).toHaveLength(1);
	expect(aliasCalls).toHaveLength(0);

	updateCalls[0]?.options.onSuccess?.(member());

	expect(aliasCalls).toHaveLength(1);
	expect(aliasCalls[0]?.memberId).toBe(MEMBER_ID);
	expect(aliasCalls[0]?.alias).toBe("ana@panaderialafamilia.ec");
});

test("un alias que no cambió no llama a la ruta del alias", () => {
	formProps?.onSubmit({ ...VALUES, alias: "ana@panaderia.role.ec" });

	updateCalls[0]?.options.onSuccess?.(member());

	// Repetir el mismo alias sería cambiar el correo de `auth.users` sin que
	// nadie lo pidiera.
	expect(aliasCalls).toHaveLength(0);
	expect(toasts).toEqual([
		{ kind: "success", message: strings.business.staff.editSaved },
	]);
});

test("un segundo guardado no reenvía el alias que ya se guardó", () => {
	formProps?.onSubmit(VALUES);
	updateCalls[0]?.options.onSuccess?.(member());
	aliasCalls[0]?.options.onSuccess?.(aliasResponse());
	// El guardado del alias se pinta: la pantalla vuelve a pintar con el
	// alias que ahora tiene el acceso.
	render();
	expect(aliasCalls).toHaveLength(1);

	// La lista se vuelve a leer sola después de cada guardado, y su respuesta
	// puede tardar: si la comparación se hiciese contra el `member` de vivo,
	// este segundo guardado reenviaría el alias que ya está guardado.
	formProps?.onSubmit(VALUES);
	updateCalls[1]?.options.onSuccess?.(member());

	expect(aliasCalls).toHaveLength(1);
});

test("un fallo del rol no toca el alias", () => {
	formProps?.onSubmit(VALUES);

	updateCalls[0]?.options.onError?.(
		Errors.businessRule("Tu plan no admite ese acceso.", "R0001"),
	);
	render();

	expect(aliasCalls).toHaveLength(0);
	expect(formProps?.error).toBe("Tu plan no admite ese acceso.");
	expect(toasts).toHaveLength(0);
});

test("un fallo del alias deja la pantalla abierta con el acceso ya actualizado", () => {
	formProps?.onSubmit(VALUES);
	updateCalls[0]?.options.onSuccess?.(member());

	aliasCalls[0]?.options.onError?.(Errors.conflict("Ese alias ya existe."));
	render();

	// El rol, el alcance y la política YA están guardados: su fallo no
	// revierte lo otro, así que la pantalla sigue abierta y lo dice.
	expect(formProps).not.toBeNull();
	expect(formProps?.error).toBe("Ese alias ya existe.");
	// Y no se-annuncia un éxito que no ocurrió del todo.
	expect(toasts).toHaveLength(0);
});

// ─── El aviso del §9.4 ───────────────────────────────────────────────────────

test("el aviso que devuelve el API se pasa al formulario", () => {
	formProps?.onSubmit(VALUES);
	updateCalls[0]?.options.onSuccess?.(member());
	aliasCalls[0]?.options.onSuccess?.(
		aliasResponse(["alias_domain_can_receive_mail"]),
	);
	render();

	expect(formProps?.aliasWarnings).toEqual(["alias_domain_can_receive_mail"]);
	// Y se sabe PARA QUÉ alias es el aviso: es lo que lo ata al campo.
	expect(formProps?.aliasWarningsFor).toBe("ana@panaderialafamilia.ec");
});

test("un alcance vacío se envía como un alcance vacío", () => {
	// §5.1: un acceso sin filas de alcance no alcanza ningún recurso, y ese
	// estado es legítimo: cambiar el rol no puede REGALAR una sucursal.
	formProps?.onSubmit({ ...VALUES, business_location_ids: [] });

	expect(updateCalls[0]?.body).toEqual({
		role: "manager",
		session_ttl_hours: 0,
		business_location_ids: [],
	});
});

// ─── El éxito ────────────────────────────────────────────────────────────────

test("al guardar bien se avisa y NO se navega", () => {
	formProps?.onSubmit(VALUES);
	updateCalls[0]?.options.onSuccess?.(member());
	aliasCalls[0]?.options.onSuccess?.(aliasResponse());
	render();

	expect(toasts).toEqual([
		{ kind: "success", message: strings.business.staff.editSaved },
	]);
	// La pantalla se queda: el aviso del §9.4 y el formulario abierto son la
	// respuesta a lo que se acaba de guardar. Ninguna navegación, de ninguna
	// clase.
	expect(navigations).toEqual([]);
	expect(formProps).not.toBeNull();
});

// ─── Los casos que no se editan ──────────────────────────────────────────────

test("el dueño no se edita: no hay formulario", () => {
	staffQuery = {
		data: [member({ role: "owner" })],
		isLoading: false,
		isError: false,
		error: null,
	};
	render();

	expect(formProps).toBeNull();
	expect(html).toContain(strings.business.staff.ownerNotEditable);
});

test("un acceso que no está en la lista no se pinta", () => {
	render(BUSINESS_ID, "99999999-9999-4999-8999-999999999999");

	expect(formProps).toBeNull();
	expect(errorStates).toHaveLength(1);
	expect(errorStates[0]?.error).toEqual(Errors.notFound());
});

test("sin negocio no se pinta el formulario: es un negocio que no está", () => {
	render("");

	expect(formProps).toBeNull();
	expect(errorStates).toHaveLength(1);
	// Y no hay reintento: lo que falta es la ruta, no la respuesta.
	expect(errorStates[0]?.onRetry).toBeUndefined();
});

test("mientras carga la lista no se pinta el formulario", () => {
	staffQuery = {
		data: undefined,
		isLoading: true,
		isError: false,
		error: null,
	};
	render();

	expect(formProps).toBeNull();
	expect(html).toContain("SKELETON");
});

test("si la lista falla se pinta el error y el reintento vuelve a pedirla", () => {
	staffQuery = {
		data: undefined,
		isLoading: false,
		isError: true,
		error: new Error("sin permisos"),
	};
	render();

	expect(formProps).toBeNull();
	expect(errorStates).toHaveLength(1);

	errorStates[0]?.onRetry?.();
	expect(membersRefetchCalls).toBe(1);
});
