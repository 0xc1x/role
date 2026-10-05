import { beforeEach, describe, expect, mock, it } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import type { Announcement } from "@0xc1x/role-commons";

import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

import {
	buildAnnouncementList,
	type AnnouncementListItem,
} from "../domain/announcement";

// La lista: qué estado se leen los tres y qué gestos se ofrecen en cada fila.
//
// Estos tests EJECUTAN el componente con la lista que arma `buildAnnouncementList`,
// que es la costura que importa: si el componente decidiera el estado por su cuenta
// —o el botón por severidad en vez de por `canAcknowledge`/`canDismiss`— la fila
// se vería bien con estos fixtures y estaría mintiendo con los de la base.
//
// El chip y los botones se LEEN de los props que recibieron los dobles, no del
// HTML: las etiquetas de un estado y de un botón coinciden ("Entendido" es el chip
// del entendido y también el botón), y un `toContain` sobre el markup no
// distinguiría uno del otro.

type ChipProbe = { label: string; tone?: string };
// La etiqueta de un `Button` viaja como `children`, que es la forma en que el
// componente la pasa; leer `label` sería leer un prop que el botón no tiene.
type ButtonProbe = {
	children?: ReactNode;
	onPress?: () => void;
	loading?: boolean;
};

let chips: ChipProbe[] = [];
let buttons: ButtonProbe[] = [];
let html = "";

const wrapper = ({ children }: { children?: ReactNode }) =>
	createElement(nativeWeb.View, null, children);
const empty = () => null;

mockNativeUi({ ActivityIndicator: empty, RefreshControl: empty });

mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));
// El barril del kit se dobla entero y a propósito: lo que se afirma acá es qué
// fila recibe qué rótulo, y el `StatusBadge` real pinta colores que en el markup
// no distinguen un tono de otro.
mock.module("@/src/core/ui", () => ({
	AppText: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.Text, null, children),
	EmptyState: (props: { title: string }) =>
		createElement(nativeWeb.Text, null, `EMPTY:${props.title}`),
	LoadingView: () => createElement(nativeWeb.Text, null, "LOADING"),
	Screen: wrapper,
	ScreenHeader: (props: { title?: string }) =>
		createElement(nativeWeb.Text, null, props.title),
	StatusBadge: (props: ChipProbe) => {
		chips.push(props);
		return createElement(nativeWeb.Text, null, props.label);
	},
}));
mock.module("@/components/ui/button", () => ({
	Button: (props: ButtonProbe) => {
		buttons.push(props);
		return createElement(nativeWeb.Text, null, props.children);
	},
}));

// El hook se dobla, no el dominio: `buildAnnouncementList` es pura y tiene su
// propio archivo de tests. Lo que se mide acá es qué hace la lista con lo que el
// hook le da.
let items: AnnouncementListItem[] = [];
const useAnnouncementList = mock(() => ({
	items,
	acknowledge: async (_id: string) => {},
	silence: (_id: string) => {},
	isLoading: false,
	isError: false,
	refetch: async () => {},
}));
mock.module("../hooks", () => ({ useAnnouncementList }));

const { AnnouncementList } = await import("./announcement-list");

// ── Avisos de prueba ────────────────────────────────────────────────────────

/**
 * Los ids son opacos porque esta lista no los valida: acá se comparan strings.
 * Si la fixture pasara por `AnnouncementSchema`, `z.uuid()` chequearía el nibble
 * de versión de cada uno y el rechazo caería en la fixture y no en el test.
 */
function aviso(id: string, severity: "info" | "required"): Announcement {
	return {
		id,
		title: `Aviso ${id}`,
		body: `Cuerpo de ${id}`,
		severity,
		audience_kind: "all",
		priority: 0,
		active: true,
		start_at: null,
		end_at: null,
		created_at: "2026-10-01T00:00:00.000Z",
		updated_at: "2026-10-01T00:00:00.000Z",
	};
}

const REQUERIDO = aviso("r-1", "required");
const ENTENDIDO = aviso("r-2", "required");
const SILENCIADO = aviso("r-3", "required");
const NOVELAD = aviso("i-1", "info");

/**
 * La lista que la base devolvería, tal cual: sin reordenar.
 *
 * Y EL ORDEN NO ES EL DE LA SEVERIDAD A PROPÓSITO: la fila de `info` va
 * primero, y un `required` detrás. Es un caso real —el `ORDER BY` es por
 * prioridad, no por severidad— y es el que distingue "la lista no reordena" de
 * "la lista ordena por la regla del modal": con la lista puesta en orden de
 * severidad, un `.sort` por severidad pasaría igual.
 */
function lista(): AnnouncementListItem[] {
	return buildAnnouncementList(
		[NOVELAD, REQUERIDO, ENTENDIDO, SILENCIADO],
		new Set([ENTENDIDO.id]),
		new Set([SILENCIADO.id]),
	);
}

function montar(): string {
	chips = [];
	buttons = [];
	html = renderToStaticMarkup(
		createElement(AnnouncementList, { fallback: "/(consumer)/profile" }),
	);
	return html;
}

beforeEach(() => {
	items = lista();
	chips = [];
	buttons = [];
	html = "";
});

describe("los tres estados se leen distintos en cada fila", () => {
	it("cada fila pinta el chip de su estado", () => {
		montar();

		// El orden de los chips es el de las filas, y es el orden que vino de la
		// consulta: la lista no reordena y el chip tampoco. Con la fila de `info`
		// primera, un `sort` por severidad pondría el `required` adelante y esta
		// lista de etiquetas se rompería.
		expect(chips.map((chip) => chip.label)).toEqual([
			strings.announcements.statePending,
			strings.announcements.statePending,
			strings.announcements.stateAcknowledged,
			strings.announcements.stateDismissed,
		]);
		// Y los cuatro textos del operador están, en el mismo orden.
		expect(html.indexOf("Aviso i-1")).toBeLessThan(html.indexOf("Aviso r-1"));
		expect(html.indexOf("Aviso r-1")).toBeLessThan(html.indexOf("Aviso r-2"));
		expect(html.indexOf("Aviso r-2")).toBeLessThan(html.indexOf("Aviso r-3"));
	});

	it("el cuerpo del aviso va como texto, sin interpretarlo", () => {
		montar();

		// El cuerpo llega como lo que escribió el operador. Lo que se afirma es que
		// se pinta tal cual y que no hay markup en el medio: el texto es un nodo,
		// no una fuente de HTML ni de markdown.
		expect(html).toContain("Cuerpo de r-1");
		expect(html).not.toContain("dangerouslySetInnerHTML");
	});
});

describe("qué gestos se ofrecen y cuáles no", () => {
	it("un required pendiente muestra los dos botones", () => {
		montar();

		// Un solo par de botones en toda la lista, y es el de la fila pendiente: las
		// otras tres no ofrecen nada.
		expect(buttons.map((button) => button.children)).toEqual([
			strings.announcements.acknowledge,
			strings.announcements.silence,
		]);
	});

	it("un required ya resuelto no muestra ninguno", () => {
		items = buildAnnouncementList(
			[ENTENDIDO, SILENCIADO],
			new Set([ENTENDIDO.id]),
			new Set([SILENCIADO.id]),
		);

		montar();

		// Ni el entendido ni el silenciado ofrecen acciones: las dos acciones no
		// tienen a qué aplicarse sobre algo que ya se resolvió.
		expect(buttons).toHaveLength(0);
	});

	it("un info pendiente no muestra ninguno", () => {
		items = buildAnnouncementList([NOVELAD], new Set(), new Set());

		montar();

		// Su descarte vive en el modal, que es donde está su gesto. Acá no hay
		// botón: una fila de `info` con acciones sugeriría que se puede resolver
		// desde esta pantalla algo que no tiene resolución.
		expect(buttons).toHaveLength(0);
		// Pero sí se pinta, con su chip de pendiente: es un aviso que le llega.
		expect(chips.map((chip) => chip.label)).toEqual([
			strings.announcements.statePending,
		]);
		expect(html).toContain("Aviso i-1");
	});
});

describe("la lista vacía no es un error", () => {
	it("muestra el EmptyState y no una lista vacía", () => {
		items = [];

		montar();

		expect(html).toContain(`EMPTY:${strings.announcements.listEmptyTitle}`);
		expect(buttons).toHaveLength(0);
	});
});
