import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import type {
	BusinessLocation,
	BusinessMemberDeliveryCardDto,
} from "@0xc1x/role-commons";
import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { Errors } from "@/src/core/error/app-error";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import type { StaffFormValues } from "./StaffForm";

/**
 * La pantalla del alta de un acceso (§9.2) — la parte que decide el ORDEN.
 *
 * Lo que se afirma aquí:
 *
 *  1. Al crear bien, la persona SE QUEDA en la pantalla: la tarjeta se monta
 *     con el PIN y NO se navega a ninguna parte. El PIN no viaja por la ruta.
 *  2. Al cerrar la hoja, la tarjeta se suelta y se vuelve al listado.
 *  3. Un fallo del alta se pinta con la prosa que el API ya escribió.
 *  4. Las sucursales tienen TRES estados: cargando, fallando y cargadas. Un
 *     fallo no es «este negocio no tiene sucursales».
 */

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

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

const CARD: BusinessMemberDeliveryCardDto = {
	alias: "ana@panaderia.role.ec",
	pin: "482913",
	alias_warnings: [],
};

// ─── Las sondas ──────────────────────────────────────────────────────────────

interface FormProps {
	locations: BusinessLocation[];
	submitting: boolean;
	error: string | null;
	onSubmit: (values: StaffFormValues) => void;
}

interface SheetProps {
	card: BusinessMemberDeliveryCardDto;
	onClose: () => void;
}

interface ErrorStateProps {
	error: unknown;
	onRetry?: () => void;
}

/** Las props con las que se pintó el formulario. */
let formProps: FormProps | null = null;
/** Las props con las que se pintó la hoja de entrega. */
let sheetProps: SheetProps | null = null;
/** Los estados de error pintados. */
let errorStates: ErrorStateProps[] = [];
/** Las navegaciones que se pidieron. */
let navigations: Array<{ kind: "push" | "replace"; path: string }> = [];
/** Los ids con los que se pidieron las sucursales y las mutaciones. */
let locationsBusinessIds: string[] = [];
let mutationsBusinessIds: string[] = [];
/** Cuántas veces se reintentó la consulta de sucursales. */
let refetchCalls = 0;

interface CreateCall {
	body: unknown;
	options: { onError?: (error: unknown) => void };
}
const createCalls: CreateCall[] = [];
/** Cuántas veces se reseteó la mutación del alta. */
const createResets: number[] = [];
/** La tarjeta que el API devolvió: es el estado de la mutación. */
let createData: BusinessMemberDeliveryCardDto | undefined;

const createDouble = {
	mutate: (body: unknown, options: { onError?: (error: unknown) => void }) => {
		createCalls.push({ body, options });
	},
	reset: () => {
		createResets.push(1);
		createData = undefined;
	},
	isPending: false,
	get data() {
		return createData;
	},
};

interface LocationsQuery {
	data: BusinessLocation[] | undefined;
	isLoading: boolean;
	isError: boolean;
	error: unknown;
}
let locationsQuery: LocationsQuery = {
	data: [CENTRO],
	isLoading: false,
	isError: false,
	error: null,
};

mockNativeUi();

mock.module("expo-router", () => ({
	router: {
		push: (path: string) => navigations.push({ kind: "push", path }),
		replace: (path: string) => navigations.push({ kind: "replace", path }),
	},
}));

mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));

mock.module("@/src/core/ui", () => ({
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
	useBusinessLocations: (businessId: string) => {
		locationsBusinessIds.push(businessId);
		return {
			...locationsQuery,
			refetch: () => {
				refetchCalls += 1;
			},
		};
	},
	useStaffMutations: (businessId: string) => {
		mutationsBusinessIds.push(businessId);
		return { create: createDouble };
	},
}));

// El formulario y la hoja se doblean para poder observar lo que la pantalla
// les pasa: el PIN viaja del API a la hoja, y eso es justo lo que hay que
// afirmar sin volver a pintar la tarjeta entera.
mock.module("./StaffForm", () => ({
	StaffForm: (props: FormProps) => {
		formProps = props;
		return createElement(nativeWeb.Text, null, "STAFF_FORM");
	},
}));

mock.module("./DeliveryCardSheet", () => ({
	DeliveryCardSheet: (props: SheetProps) => {
		sheetProps = props;
		return createElement(nativeWeb.Text, null, "DELIVERY_CARD_SHEET");
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

const { StaffNewScreen } = await import("./StaffNewScreen");

// ─── El render ───────────────────────────────────────────────────────────────

let html = "";

function render(): void {
	hookCursor = 0;
	formProps = null;
	sheetProps = null;
	errorStates = [];
	html = renderToStaticMarkup(
		createElement(StaffNewScreen, { businessId: BUSINESS_ID }),
	);
}

const VALUES: StaffFormValues = {
	label: "Ana Torres",
	role: "staff",
	business_location_ids: [CENTRO.id],
	session_ttl_hours: 24,
};

/** El API responde el alta: la tarjeta queda en el estado de la mutación. */
function resolveWith(deliveryCard: BusinessMemberDeliveryCardDto): void {
	createData = deliveryCard;
	render();
}

beforeEach(() => {
	navigations = [];
	locationsBusinessIds = [];
	mutationsBusinessIds = [];
	refetchCalls = 0;
	createCalls.length = 0;
	createResets.length = 0;
	createData = undefined;
	slots.length = 0;
	locationsQuery = {
		data: [CENTRO],
		isLoading: false,
		isError: false,
		error: null,
	};
	render();
});

// ─── El orden: la tarjeta se entrega ANTES de navegar ───────────────────────

test("al crear bien la tarjeta se monta y no se navega a ninguna parte", () => {
	expect(formProps).not.toBeNull();

	formProps?.onSubmit(VALUES);

	// El cuerpo es el que el API espera.
	expect(createCalls).toHaveLength(1);
	expect(createCalls[0]?.body).toEqual({
		label: "Ana Torres",
		role: "staff",
		business_location_ids: [CENTRO.id],
		session_ttl_hours: 24,
	});

	resolveWith(CARD);

	// La hoja recibe la tarjeta con su PIN.
	expect(sheetProps?.card).toEqual(CARD);

	// Y NO se navega: el PIN no viaja por la ruta, ni por el historial, ni por
	// el botón de atrás.
	expect(navigations).toEqual([]);
});

test("el alias vacío no viaja en el cuerpo del alta", () => {
	formProps?.onSubmit(VALUES);

	expect(Object.keys((createCalls[0]?.body ?? {}) as object)).not.toContain(
		"alias",
	);
});

test("cerrar la hoja suelta la tarjeta y vuelve al listado", () => {
	formProps?.onSubmit(VALUES);
	resolveWith(CARD);
	expect(sheetProps).not.toBeNull();

	sheetProps?.onClose();

	// La tarjeta se suelta: la mutación se resetea y con ella el PIN.
	expect(createResets).toEqual([1]);
	expect(navigations).toEqual([
		{ kind: "replace", path: `/business/${BUSINESS_ID}/staff` },
	]);
});

test("un fallo del alta se pinta con la prosa que escribió el API", () => {
	formProps?.onSubmit(VALUES);

	createCalls[0]?.options.onError?.(
		Errors.businessRule("Tu plan no admite otro acceso.", "R0001"),
	);
	render();

	expect(formProps?.error).toBe("Tu plan no admite otro acceso.");
	// Y la hoja NO se monta: no hay tarjeta que entregar.
	expect(sheetProps).toBeNull();
	expect(navigations).toEqual([]);
});

// ─── Las sucursales tienen tres estados, no uno ──────────────────────────────

test("mientras cargan las sucursales no se pinta el formulario", () => {
	locationsQuery = {
		data: undefined,
		isLoading: true,
		isError: false,
		error: null,
	};
	render();

	expect(formProps).toBeNull();
	expect(html).toContain("SKELETON");
	expect(html).toContain(strings.business.staff.newTitle);
});

test("si la consulta de sucursales falla se pinta el error con su reintento, no el formulario", () => {
	locationsQuery = {
		data: undefined,
		isLoading: false,
		isError: true,
		error: new Error("sin permisos"),
	};
	render();

	// El fallo NO se cuenta como «este negocio no tiene sucursales».
	expect(formProps).toBeNull();
	expect(errorStates).toHaveLength(1);

	errorStates[0]?.onRetry?.();
	expect(refetchCalls).toBe(1);
});

test("con las sucursales cargadas se pinta el formulario con su alcance", () => {
	expect(formProps?.locations).toEqual([CENTRO]);
	expect(locationsBusinessIds).toEqual([BUSINESS_ID]);
	expect(mutationsBusinessIds).toEqual([BUSINESS_ID]);
});
