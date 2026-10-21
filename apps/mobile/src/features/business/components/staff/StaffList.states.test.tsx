import { beforeEach, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";

import type { BusinessLocation, BusinessMemberDto } from "@0xc1x/role-commons";
import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { formatDateTime } from "@/src/core/utils/formatters";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

/**
 * Los estados de la lista de accesos del equipo (§9.2).
 *
 * La lista es la lectura de un estado que el API decide: quién tiene acceso,
 * con qué alcance, con qué política de sesión y si está pausado. Esta lista
 * tiene CUATRO estados y cada uno se pinta de una manera —cargando, fallando,
 * vacía y con datos— porque los tres primeros son los que se alcanzan de
 * verdad: el API puede no estar, la sesión puede haber vencido y el negocio
 * puede no tener todavía a nadie más.
 *
 * ─── LO QUE SE AFIRMA AQUÍ ────────────────────────────────────────────────────
 *
 * Lo que la persona VE: esqueletos mientras carga, el error con su reintento
 * cuando la consulta falla, el alta ofrecida cuando no hay nadie, y una
 * tarjeta por acceso cuando hay datos.
 *
 * ─── Y LO QUE NO ─────────────────────────────────────────────────────────────
 *
 * Las ACCIONES sobre un acceso (pausar, rotar, cambiar el alias) no están: las
 * agregan las Tasks 9, 10 y 13 sobre esta misma tarjeta. Esta tarea afirma
 * que la tarjeta NO ofrece acciones: un botón que todavía no existe es una
 * puerta que se puede abrir por error.
 */

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

/** A dónde se ha navegado en este test. */
const navigations: string[] = [];

/** Los botones pintados, con su etiqueta y su `onPress`. */
interface ButtonProbe {
	label: string;
	onPress?: () => void;
}
const buttons: ButtonProbe[] = [];

/** Las props con las que se pintó el estado de error. */
const errorStates: Array<{ error: unknown; onRetry?: () => void }> = [];

/** Cuántas veces se ha vuelto a pedir la lista. */
let refetchCalls = 0;

/** La consulta del equipo, en el estado que el test necesita. */
type StaffQuery =
	| { data: undefined; isLoading: true; isError: false; error: null }
	| { data: undefined; isLoading: false; isError: true; error: unknown }
	| {
			data: BusinessMemberDto[];
			isLoading: false;
			isError: false;
			error: null;
	  };

let staffQuery: StaffQuery = {
	data: undefined,
	isLoading: true,
	isError: false,
	error: null,
};

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

mockNativeUi();

mock.module("expo-router", () => ({
	router: { push: (path: string) => navigations.push(path) },
}));

mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light }),
}));

// El botón se pinta con su texto: es el texto el que prueba que el alta está
// ofrecida, y su `onPress` el que prueba a dónde lleva.
mock.module("@/components/ui/button", () => ({
	Button: (props: { children?: ReactNode; onPress?: () => void }) => {
		buttons.push({ label: textOf(props.children), onPress: props.onPress });
		return createElement(nativeWeb.Text, null, props.children);
	},
}));

mock.module("@/components/ui/skeleton", () => ({
	Skeleton: () => createElement(nativeWeb.Text, null, "SKELETON"),
}));

mock.module("@/src/core/ui", () => ({
	AppText: nativeWeb.Text,
	StatusBadge: ({ label }: { label: string }) =>
		createElement(nativeWeb.Text, null, label),
	EmptyState: ({
		title,
		message,
		action,
	}: {
		title: string;
		message?: string;
		action?: ReactNode;
	}) =>
		createElement(
			nativeWeb.View,
			null,
			createElement(nativeWeb.Text, null, title),
			message ? createElement(nativeWeb.Text, null, message) : null,
			action ?? null,
		),
	ErrorState: (props: { error: unknown; onRetry?: () => void }) => {
		errorStates.push(props);
		return createElement(nativeWeb.Text, null, "ERROR_STATE");
	},
}));

mock.module("@/src/features/business/hooks", () => ({
	useStaffMembers: () => ({
		...staffQuery,
		refetch: () => {
			refetchCalls += 1;
		},
	}),
}));

const { StaffList } = await import("./StaffList");
const { StaffSectionCard } = await import("./StaffSectionCard");
const { StaffMemberCard } = await import("./StaffMemberCard");

// ─── Los fixtures ─────────────────────────────────────────────────────────────

function member(overrides: Partial<BusinessMemberDto> = {}): BusinessMemberDto {
	return {
		id: "22222222-2222-4222-8222-222222222222",
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
const NORTE = location("66666666-6666-4666-8666-666666666666", "Norte");

const renderList = (locations: BusinessLocation[] = []) =>
	renderToStaticMarkup(
		createElement(StaffList, { businessId: BUSINESS_ID, locations }),
	);

const renderSection = (role: "owner" | "manager" | "staff") =>
	renderToStaticMarkup(
		createElement(StaffSectionCard, { businessId: BUSINESS_ID, role }),
	);

const renderCard = (
	access: BusinessMemberDto,
	locations: BusinessLocation[] = [],
) =>
	renderToStaticMarkup(
		createElement(StaffMemberCard, { member: access, locations }),
	);

beforeEach(() => {
	navigations.length = 0;
	buttons.length = 0;
	errorStates.length = 0;
	refetchCalls = 0;
	staffQuery = {
		data: undefined,
		isLoading: true,
		isError: false,
		error: null,
	};
});

// ─── Los cuatro estados de la lista ──────────────────────────────────────────

test("mientras carga se pintan esqueletos, no una lista vacía", () => {
	const html = renderList();

	expect(html).toContain("SKELETON");
	expect(html).not.toContain(strings.business.staff.emptyTitle);
});

test("si la consulta falla se pinta el error y el reintento vuelve a pedir la lista", () => {
	staffQuery = {
		data: undefined,
		isLoading: false,
		isError: true,
		error: new Error("sin permisos"),
	};

	const html = renderList();

	expect(html).toContain("ERROR_STATE");
	expect(html).not.toContain(strings.business.staff.emptyTitle);

	// El reintento NO es un botón decorativo: vuelve a pedir la lista.
	expect(errorStates).toHaveLength(1);
	errorStates[0]?.onRetry?.();
	expect(refetchCalls).toBe(1);
});

test("sin accesos se ofrece el alta y el alta lleva a la pantalla de alta", () => {
	staffQuery = { data: [], isLoading: false, isError: false, error: null };

	const html = renderList();

	expect(html).toContain(strings.business.staff.emptyTitle);
	expect(html).toContain(strings.business.staff.emptyBody);

	const add = buttons.find(
		(button) => button.label === strings.business.staff.addAccess,
	);
	expect(add).toBeDefined();
	add?.onPress?.();
	expect(navigations).toEqual([`/business/${BUSINESS_ID}/staff/new`]);
});

test("con dos accesos hay una tarjeta por acceso y la sección cuenta dos", () => {
	staffQuery = {
		data: [
			member({
				id: "aaaaaaaa-1111-4111-8111-111111111111",
				label: "Ana Torres",
			}),
			member({
				id: "bbbbbbbb-2222-4222-8222-222222222222",
				label: "Luis Vega",
				role: "manager",
				alias: "luis@panaderia.role.ec",
			}),
		],
		isLoading: false,
		isError: false,
		error: null,
	};

	const html = renderList();

	expect(html).toContain("Ana Torres");
	expect(html).toContain("ana@panaderia.role.ec");
	expect(html).toContain("Luis Vega");
	expect(html).toContain("luis@panaderia.role.ec");
	// Y la tarjeta NO ofrece acciones: las agregan las Tasks 9, 10 y 13.
	expect(buttons).toHaveLength(0);

	// Y la sección del panel anuncia el conteo.
	const section = renderSection("owner");
	expect(section).toContain(strings.business.staff.sectionTitle);
	expect(section).toContain(
		strings.business.staff.sectionSubtitle.replace("{count}", "2"),
	);
});

// ─── La tarjeta de un acceso ──────────────────────────────────────────────────

test("la tarjeta dice el rol, el alcance, la sesión, la última entrada y el estado", () => {
	const lastLogin = "2026-10-20T14:30:00.000Z";
	const html = renderCard(
		member({
			label: "Ana Torres",
			alias: "ana@panaderia.role.ec",
			role: "manager",
			status: "disabled",
			session_ttl_hours: 0,
			business_location_ids: [CENTRO.id],
			last_authenticated_at: lastLogin,
		}),
		[CENTRO],
	);

	expect(html).toContain("Ana Torres");
	expect(html).toContain("ana@panaderia.role.ec");
	expect(html).toContain(strings.business.staff.roleManager);
	expect(html).toContain("Centro");
	expect(html).toContain(strings.business.staff.sessionNever);
	expect(html).toContain(formatDateTime(lastLogin));
	expect(html).toContain(strings.business.staff.statusPaused);
	// Una tarjeta sin acciones es lo que esta tarea promises: el menú de lo
	// que se le puede hacer a un acceso llega en las Tasks 9, 10 y 13.
	expect(buttons).toHaveLength(0);
});

test("una sesión por turnos dice las horas y un acceso que nunca entró lo dice", () => {
	const html = renderCard(
		member({ session_ttl_hours: 8, last_authenticated_at: null }),
	);

	expect(html).toContain(
		strings.business.staff.sessionHours.replace("{n}", "8"),
	);
	expect(html).toContain(strings.business.staff.neverLoggedIn);
	expect(html).toContain(strings.business.staff.statusActive);
});

test("el alcance dice el nombre cuando el negocio tiene una sola sucursal", () => {
	const html = renderCard(member({ business_location_ids: [CENTRO.id] }), [
		CENTRO,
	]);

	expect(html).toContain("Centro");
	expect(html).not.toContain(
		strings.business.staff.locations.replace("{n}", "1"),
	);
});

test("el alcance cuenta las sucursales cuando el negocio tiene varias", () => {
	const html = renderCard(
		member({ business_location_ids: [CENTRO.id, SUR.id, NORTE.id] }),
		[CENTRO, SUR, NORTE],
	);

	expect(html).toContain(strings.business.staff.locations.replace("{n}", "3"));
});

test("un acceso sin alcance alcanza a todas las sucursales", () => {
	const html = renderCard(member({ business_location_ids: [] }), [CENTRO, SUR]);

	expect(html).toContain(strings.business.staff.allLocations);
	expect(html).not.toContain(
		strings.business.staff.locations.replace("{n}", "0"),
	);
});

// ─── La tarjeta de la sección ─────────────────────────────────────────────────

test("la sección la ve el gerente y el cajero no", () => {
	staffQuery = {
		data: [member()],
		isLoading: false,
		isError: false,
		error: null,
	};

	const gerente = renderSection("manager");
	expect(gerente).toContain(strings.business.staff.sectionTitle);
	expect(gerente).toContain(strings.business.staff.manage);

	const cajero = renderSection("staff");
	expect(cajero).not.toContain(strings.business.staff.sectionTitle);
	expect(cajero).not.toContain(strings.business.staff.manage);
});

test("el botón de la sección lleva a la pantalla del equipo", () => {
	const html = renderSection("owner");

	const manage = buttons.find(
		(button) => button.label === strings.business.staff.manage,
	);
	expect(manage).toBeDefined();
	manage?.onPress?.();
	expect(navigations).toEqual([`/business/${BUSINESS_ID}/staff`]);
	expect(html).toContain(strings.business.staff.sectionTitle);
});

test("un fallo en la lista no borra la sección: el título y el botón siguen", () => {
	staffQuery = {
		data: undefined,
		isLoading: false,
		isError: true,
		error: new Error("sin permisos"),
	};

	const html = renderSection("owner");

	expect(html).toContain(strings.business.staff.sectionTitle);
	expect(html).toContain(strings.business.staff.manage);
	// El conteo no se inventa: sin datos no hay número que anunciar.
	expect(html).not.toContain(
		strings.business.staff.sectionSubtitle.replace("{count}", "0"),
	);
});
