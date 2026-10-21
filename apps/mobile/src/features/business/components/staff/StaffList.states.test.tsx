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
 * La lista y la tarjeta no PINTA las acciones: la tarjeta ofrece la entrada —
 *«Editar» y «Más acciones»— y las acciones viven en una hoja aparte (Task 10).
 * Esta tarea afirma que la tarjeta ofrece esas dos entradas, y que el dueño —
 * a quien la propiedad se le TRANSFIERE, no se le edita— no tiene ninguna.
 */

const BUSINESS_ID = "11111111-1111-4111-8111-111111111111";

/** A dónde se ha navegado en este test. */
const navigations: string[] = [];

/** Los botones pintados, con su etiqueta, su `onPress` y su objeto. */
interface ButtonProbe {
	label: string;
	onPress?: () => void;
	accessibilityLabel?: string;
}
const buttons: ButtonProbe[] = [];

/** Las props con las que se pintó el estado de error. */
const errorStates: Array<{ error: unknown; onRetry?: () => void }> = [];

/** Las hojas de acciones montadas, con las props con las que se pintaron. */
const actionSheets: Array<{ businessId: string; member: BusinessMemberDto }> =
	[];

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
// ofrecida, y su `onPress` el que prueba a dónde lleva. El
// `accessibilityLabel` se pinta como `aria-label`, que es lo que
// react-native-web hace con él en un `Pressable`: así el objeto del botón se
// puede leer en el markup, no sólo en las props.
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
		return createElement(
			nativeWeb.Text,
			{ "aria-label": props.accessibilityLabel },
			props.children,
		);
	},
}));

mock.module("@/components/ui/skeleton", () => ({
	Skeleton: () => createElement(nativeWeb.Text, null, "SKELETON"),
}));

// La hoja de acciones se dobla: lo que se afirma acá es que la tarjeta la
// ABRE y con qué acceso —no lo que la hoja hace por dentro, que es cosa de su
// propio test—.
mock.module("./StaffActionsSheet", () => ({
	StaffActionsSheet: (props: {
		businessId: string;
		member: BusinessMemberDto;
	}) => {
		actionSheets.push(props);
		return createElement(nativeWeb.Text, null, "STAFF_ACTIONS_SHEET");
	},
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

/**
 * Los ids con los que se pidió la lista.
 *
 * Se registran porque la protección del cajero —que no dispare la consulta—
 * no se puede afirmar leyendo el código del hook: se afirma mirando el id
 * que la tarjeta le pasó.
 */
const staffQueries: string[] = [];

mock.module("@/src/features/business/hooks", () => ({
	useStaffMembers: (businessId: string) => {
		staffQueries.push(businessId);
		return {
			...staffQuery,
			refetch: () => {
				refetchCalls += 1;
			},
		};
	},
}));

// ─── Un `useState` que REALMENTE guarda ──────────────────────────────────────
//
// `renderToStaticMarkup` es un render único: la fibra se descarta y un
// `setState` posterior no vuelve a pintar nada. El reemplazo guarda el valor
// en una casilla que sobrevive entre renders, así que el ciclo escribir →
// volver a renderizar → leer es el mismo que en la app. Sin esto, «pulsar
// «Más acciones»» no abriría nada que se pueda ver.
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

const renderList = (locations: BusinessLocation[] = []) => {
	hookCursor = 0;
	return renderToStaticMarkup(
		createElement(StaffList, { businessId: BUSINESS_ID, locations }),
	);
};

const renderSection = (role: "owner" | "manager" | "staff") => {
	hookCursor = 0;
	return renderToStaticMarkup(
		createElement(StaffSectionCard, { businessId: BUSINESS_ID, role }),
	);
};

const renderCard = (
	access: BusinessMemberDto,
	locations: BusinessLocation[] = [],
) => {
	hookCursor = 0;
	return renderToStaticMarkup(
		createElement(StaffMemberCard, {
			businessId: BUSINESS_ID,
			member: access,
			locations,
		}),
	);
};

beforeEach(() => {
	navigations.length = 0;
	buttons.length = 0;
	errorStates.length = 0;
	actionSheets.length = 0;
	staffQueries.length = 0;
	refetchCalls = 0;
	slots.length = 0;
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
	// Y la tarjeta ofrece las dos entradas: la de editar y la de las demás
	// acciones. Dos por acceso.
	expect(buttons).toHaveLength(4);

	// Y la sección del panel anuncia el conteo.
	const section = renderSection("owner");
	expect(section).toContain(strings.business.staff.sectionTitle);
	expect(section).toContain(
		strings.business.staff.sectionSubtitle.replace("{count}", "2"),
	);
});

test("con un solo acceso la sección lo cuenta en singular", () => {
	staffQuery = {
		data: [member()],
		isLoading: false,
		isError: false,
		error: null,
	};

	const section = renderSection("owner");

	// «1 personas con acceso» no es español, y el negocio con un acceso es el
	// caso normal de un negocio nuevo.
	expect(section).toContain(strings.business.staff.sectionSubtitleOne);
	expect(section).not.toContain(
		strings.business.staff.sectionSubtitle.replace("{count}", "1"),
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
	// Las dos entradas de la tarjeta: editar y las demás acciones.
	expect(buttons).toHaveLength(2);
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

test("el alcance dice el nombre cuando el acceso alcanza una sola sucursal", () => {
	const html = renderCard(member({ business_location_ids: [CENTRO.id] }), [
		CENTRO,
		SUR,
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

test("un alcance de una sola fila que ya no resuelve se cuenta en singular", () => {
	// La sucursal se borró y el id quedó viejo: el alcance sigue siendo de
	// UNA, y el nombre no se inventa.
	const html = renderCard(
		member({
			business_location_ids: ["99999999-9999-4999-8999-999999999999"],
		}),
		[CENTRO, SUR],
	);

	expect(html).toContain(strings.business.staff.locationsOne);
	expect(html).not.toContain(
		strings.business.staff.locations.replace("{n}", "1"),
	);
});

test("un acceso sin alcance no alcanza ninguna sucursal", () => {
	// §5.1: sin filas de alcance no se alcanza NINGÚN recurso. El alcance
	// vacío no es «todo» —eso es del dueño—.
	const html = renderCard(member({ business_location_ids: [] }), [CENTRO, SUR]);

	expect(html).toContain(strings.business.staff.noLocations);
	expect(html).not.toContain(strings.business.staff.allLocations);
	expect(html).not.toContain(
		strings.business.staff.locations.replace("{n}", "0"),
	);
});

test("el dueño alcanza todas las sucursales aunque no tenga filas de alcance", () => {
	// El dueño llega al negocio entero por su ROL, con o sin filas (§5.1).
	const html = renderCard(
		member({ role: "owner", business_location_ids: [] }),
		[CENTRO, SUR],
	);

	expect(html).toContain(strings.business.staff.allLocations);
	expect(html).not.toContain(strings.business.staff.noLocations);
});

// ─── La entrada a la edición ─────────────────────────────────────────────────

test("un acceso que no es el dueño ofrece editar y lleva a su pantalla", () => {
	const html = renderCard(member({ role: "staff" }));

	expect(html).toContain(strings.business.staff.edit);

	const editar = buttons.find(
		(button) => button.label === strings.business.staff.edit,
	);
	expect(editar).toBeDefined();
	// El botón dice a QUIÉN se edita: en una lista, un «Editar» a secas es
	// un botón que no dice de qué.
	expect(editar?.accessibilityLabel).toBe(
		strings.business.staff.editAccessibilityLabel.replace(
			"{name}",
			"Ana Torres",
		),
	);
	editar?.onPress?.();

	// La ruta lleva al acceso CONCRETO: editar «alguien» no dice a quién.
	expect(navigations).toEqual([
		`/business/${BUSINESS_ID}/staff/${member().id}/edit`,
	]);
});

test("el dueño no ofrece editar: la propiedad se transfiere, no se edita", () => {
	const html = renderCard(member({ role: "owner" }));

	expect(html).not.toContain(strings.business.staff.edit);
	expect(buttons).toHaveLength(0);
});

// ─── La entrada a las demás acciones ─────────────────────────────────────────

// El gerente y el empleado administran sus accesos igual: los dos tienen la
// hoja. Lo que NO la tiene es el dueño.
for (const role of ["staff", "manager"] as const) {
	test(`un acceso de rol ${role} ofrece más acciones y abre la hoja`, () => {
		const html = renderCard(member({ role }));

		expect(html).toContain(strings.business.moreActions);

		const mas = buttons.find(
			(button) => button.label === strings.business.moreActions,
		);
		expect(mas).toBeDefined();
		// El botón dice a QUIÉN: en una lista, un «Más acciones» a secas es un
		// botón que no dice de qué.
		expect(mas?.accessibilityLabel).toBe(
			strings.business.staff.moreActionsAccessibilityLabel.replace(
				"{name}",
				"Ana Torres",
			),
		);

		// Y al pulsarlo se abre la hoja de acciones DE ESE acceso.
		expect(actionSheets).toHaveLength(0);
		mas?.onPress?.();
		renderCard(member({ role }));

		expect(actionSheets).toHaveLength(1);
		expect(actionSheets[0]?.businessId).toBe(BUSINESS_ID);
		expect(actionSheets[0]?.member.id).toBe(member().id);
	});
}

test("el dueño no ofrece más acciones: la propiedad se transfiere, no se administra", () => {
	const html = renderCard(member({ role: "owner" }));

	expect(html).not.toContain(strings.business.moreActions);
	expect(buttons).toHaveLength(0);
	expect(actionSheets).toHaveLength(0);
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

test("el cajero no dispara la consulta de la lista", () => {
	staffQuery = {
		data: [member()],
		isLoading: false,
		isError: false,
		error: null,
	};

	renderSection("staff");

	// ─── LA FORMA DEL ÁRBOL QUE ESTO FIXA ───────────────────────────────────────
	//
	// La tarjeta se MONTA siempre —es el panel el que la pinta, y el panel no
	// filtra por rol—; lo que cambia es el id que la tarjeta le pasa a la
	// consulta. Para un cajero ese id es VACÍO, y `useStaffMembers` deja la
	// consulta apagada con `enabled: Boolean(businessId)`: el cajero no pide
	// una lista que el API le negaría.
	//
	// La forma alternativa —que la tarjeta no se montara— también sería
	// válida, pero no es la que hay: el filtro vive DENTRO de la tarjeta, que
	// es donde el §9.3 quiere que viva el mínimo.
	expect(staffQueries).toEqual([""]);

	// Y el gerente sí pide la lista, con su negocio.
	staffQueries.length = 0;
	renderSection("manager");
	expect(staffQueries).toEqual([BUSINESS_ID]);
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

	// El conteo no se inventa: sin datos no hay NINGÚN subtítulo, ni el
	// singular ni el plural, ni con el número que sea. Se afirma la AUSENCIA
	// del nodo de conteo, no la ausencia de una forma concreta de él.
	for (const count of [0, 1, 2, 3, 5, 10]) {
		expect(html).not.toContain(
			strings.business.staff.sectionSubtitle.replace("{count}", String(count)),
		);
	}
	expect(html).not.toContain(strings.business.staff.sectionSubtitleOne);
	// Ni el marcador sin interpolar: el catálogo no se pinta nunca.
	expect(html).not.toContain(strings.business.staff.sectionSubtitle);
});

test("los botones del equipo dicen a qué se refieren", () => {
	staffQuery = { data: [], isLoading: false, isError: false, error: null };

	// El botón del estado vacío.
	const lista = renderList();
	expect(lista).toContain(
		`aria-label="${strings.business.staff.addAccessAccessibilityLabel}"`,
	);
	const add = buttons.find(
		(button) => button.label === strings.business.staff.addAccess,
	);
	expect(add?.accessibilityLabel).toBe(
		strings.business.staff.addAccessAccessibilityLabel,
	);

	// Y el de la sección.
	buttons.length = 0;
	const seccion = renderSection("owner");
	expect(seccion).toContain(
		`aria-label="${strings.business.staff.manageAccessibilityLabel}"`,
	);
	const manage = buttons.find(
		(button) => button.label === strings.business.staff.manage,
	);
	expect(manage?.accessibilityLabel).toBe(
		strings.business.staff.manageAccessibilityLabel,
	);
});
