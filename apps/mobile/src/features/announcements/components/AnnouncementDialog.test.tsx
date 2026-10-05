import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import type { Announcement } from "@0c1x/role-commons";

import { strings } from "@/src/core/i18n/strings";
import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";
import type { AnnouncementModal } from "../domain/announcement";

// El modal es la primera vez que la persona VE el feature, así que los casos
// acá no son de estilo: son de lo que el gesto hace con la cola.
//
// La regla que organiza el componente es que un `required` sale de la cola de
// dos maneras que no son la misma —se lo entendió, o se lo cerró— y solo la
// primera escribe algo. Los tests fijan que ningún gesto de cierre escriba, y
// que el único que escriba sea el botón de entender.
//
// El `Modal` de react-native es una SONDA, no un doble: se registra lo que
// recibe y se pintan los hijos. `renderToStaticMarkup` no tiene DOM y el
// `ModalPortal` de react-native-web devuelve `null` sin él, así que con el
// `Modal` real estos tests no verían nada del componente.

type ShellProbe = {
	visible?: boolean;
	onRequestClose?: () => void;
	children?: ReactNode;
};

type ButtonProbe = {
	onPress?: () => void;
	loading?: boolean;
	children?: ReactNode;
};

type PressableProbe = {
	onPress?: () => void;
	children?: ReactNode;
};

let shells: ShellProbe[] = [];
let buttons: ButtonProbe[] = [];
let pressables: PressableProbe[] = [];
let html = "";

mockNativeUi({
	Platform: { OS: "ios" },
	Modal: (props: ShellProbe) => {
		shells.push(props);
		return props.visible === false
			? null
			: createElement(nativeWeb.View, null, props.children);
	},
	Pressable: (props: PressableProbe) => {
		pressables.push(props);
		return createElement(nativeWeb.View, null, props.children);
	},
});

mock.module("@/src/core/theme", () => ({
	useTheme: () => ({ colors: light, scheme: "light" }),
}));
mock.module("@/src/core/ui", () => ({
	AppText: ({ children }: { children?: ReactNode }) =>
		createElement(nativeWeb.Text, null, children),
}));
mock.module("@/components/ui/button", () => ({
	Button: (props: ButtonProbe) => {
		buttons.push(props);
		return createElement(nativeWeb.Text, null, props.children);
	},
}));

// ── Un `useState` que REALMENTE guarda ─────────────────────────────────────
//
// `renderToStaticMarkup` es un render único: la fibra se descarta y un
// `setState` posterior no vuelve a pintar nada. Con el `useState` de React los
// handlers escribirían en el vacío y el modal nunca cambiaría de página ni se
// escondería — o sea, un test que no distinguiría un `required` que se cierra
// de uno que no. El reemplazo guarda en casillas que sobreviven entre renders,
// así que escribir → volver a pintar → leer es el mismo ciclo de la app.
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

const { AnnouncementDialog } = await import("./AnnouncementDialog");

// ── Avisos de prueba ───────────────────────────────────────────────────────

const REQUERIDO: Announcement = {
	id: "a0000000-0000-4000-8000-0000000000a1",
	title: "Actualizá tus datos",
	body: "Necesitamos tu teléfono para avisarte de las reservas.",
	severity: "required",
	audience_kind: "all",
	priority: 9,
	active: true,
	start_at: null,
	end_at: null,
	created_at: "2026-10-01T00:00:00.000Z",
	updated_at: "2026-10-01T00:00:00.000Z",
};

function informado(n: number): Announcement {
	return {
		...REQUERIDO,
		id: `a0000000-0000-4000-8000-0000000000b${n}`,
		title: `Novedad ${n}`,
		body: `Cuerpo de la novedad ${n}.`,
		severity: "info",
		priority: 10 - n,
	};
}

const LOTE = [informado(1), informado(2), informado(3)];
const IDS_DEL_LOTE = LOTE.map((a) => a.id);

const requerido = (announcement: Announcement): AnnouncementModal => ({
	kind: "required",
	announcement,
});
const lote = (announcements: Announcement[]): AnnouncementModal => ({
	kind: "info",
	announcements,
});

// ── Harness ────────────────────────────────────────────────────────────────

let entendidos: string[] = [];
let descartados: string[][] = [];
let falloAck: unknown = null;

/**
 * Un arranque. `slots` está vacía en cada test porque representa la memoria del
 * proceso: un modal nuevo del mismo aviso es un montaje nuevo, y el caso "el
 * `required` vuelve en la próxima apertura" depende justamente de eso.
 */
function pintar(
	modal: AnnouncementModal,
	handlers?: {
		onAcknowledge?: (id: string) => Promise<void>;
		onDismissInfo?: (ids: string[]) => void;
	},
): string {
	hookCursor = 0;
	shells = [];
	buttons = [];
	pressables = [];
	html = renderToStaticMarkup(
		createElement(AnnouncementDialog, {
			modal,
			onAcknowledge:
				handlers?.onAcknowledge ??
				(async (id: string) => {
					entendidos.push(id);
					if (falloAck) throw falloAck;
				}),
			onDismissInfo:
				handlers?.onDismissInfo ??
				((ids: string[]) => {
					descartados.push(ids);
				}),
		}),
	);
	return html;
}

/** Vuelve a pintar el MISMO modal, como hace el layout en el frame siguiente. */
const repintar = (modal: AnnouncementModal) => pintar(modal);

/**
 * Toca el botón y repinta, que es lo que pasa en la app: cada toque produce un
 * render nuevo, y los handlers se crean en el render del que salen. Sin el
 * repintado, dos `tocar()` seguidos usarían el mismo handler viejo —el que
 * sabía que estaba en la página 1— y el avance se contaría una sola vez.
 */
function tocarYAvanzar(modal: AnnouncementModal): string {
	tocar();
	return repintar(modal);
}

/**
 * El botón del modal. Hay uno solo y su ETIQUETA es la regla del producto: el
 * texto del botón dice si esto se cierra o se entiende, así que el helper
 * falla si aparece un segundo control en vez de devolver el que no debería.
 */
function boton(): ButtonProbe {
	if (buttons.length !== 1) {
		throw new Error(
			`se esperaba un botón y hay ${buttons.length}: ${JSON.stringify(
				buttons.map((b) => b.children),
			)}`,
		);
	}
	return buttons[0];
}

function tocar(): void {
	const press = boton().onPress;
	if (!press) throw new Error("el botón no tiene onPress");
	press();
}

/** El gesto de atrás del sistema: el `onRequestClose` de la pantalla del modal. */
function gestoDeAtras(): void {
	const shell = shells[shells.length - 1];
	if (!shell?.onRequestClose) {
		throw new Error("el modal no recibió onRequestClose");
	}
	shell.onRequestClose();
}

/** Drena la cadena de microtareas del `async` del acknowledgement. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** "1 de 3", con el catálogo de placeholders y no a mano. */
const pagina = (n: number, total: number) =>
	strings.announcements.pageCount
		.replace("{n}", String(n))
		.replace("{total}", String(total));

beforeEach(() => {
	slots.length = 0;
	entendidos = [];
	descartados = [];
	falloAck = null;
	html = "";
});

describe("el required no ofrece salida que lo saque de la cola", () => {
	test("el único control es «Entendido», sin X ni fondo tocable", () => {
		pintar(requerido(REQUERIDO));

		// Ni una X ni un fondo que cierre al tocar afuera: el `required` no
		// ofrece salida en su propia interfaz. El fondo es una superficie INERTE
		// a propósito, y esto es lo que lo afirma — un `Pressable` de fondo
		// aparece acá como un fallo, no como un detalle.
		expect(buttons).toHaveLength(1);
		expect(pressables).toHaveLength(0);
		expect(boton().children).toBe(strings.announcements.acknowledge);
		expect(html).not.toContain(strings.common.close);
	});

	test("el gesto de atrás no lo saca de la cola", async () => {
		pintar(requerido(REQUERIDO));

		gestoDeAtras();
		await flush();

		// Ni acknowledgement ni descarte: este gesto no resolvió nada. Como el
		// `required` solo sale de la cola por el acknowledgement, sigue primero
		// — la falla inversa exacta a la que la migración prohíbe, en la que un
		// obligatorio se pierde sin que nadie lo haya entendido.
		expect(entendidos).toEqual([]);
		expect(descartados).toEqual([]);

		// Y sí se va de la pantalla: D7, no bloquea, mientras la cola no cambie.
		expect(repintar(requerido(REQUERIDO))).toBe("");
	});

	test("cerrarlo y volver a montar deja el aviso otra vez en pantalla", () => {
		pintar(requerido(REQUERIDO));
		gestoDeAtras();
		expect(repintar(requerido(REQUERIDO))).toBe("");

		// Arranque nuevo: la memoria del modal anterior se fue con él, y un
		// `required` que nadie entendió tiene que volver. Sin esto, cerrarlo
		// sería perderlo.
		slots.length = 0;
		const vuelta = pintar(requerido(REQUERIDO));

		expect(vuelta).toContain(REQUERIDO.title);
		expect(entendidos).toEqual([]);
		expect(descartados).toEqual([]);
	});

	test("el texto es el del operador, con el rótulo de obligatorio", () => {
		pintar(requerido(REQUERIDO));

		// El título y el cuerpo los escribió el operador en el panel y el modal
		// no los reescribe. Lo único que agrega es el rótulo — que es lo que le
		// dice a la persona que esto no es un informativo— y la línea que
		// explica por qué puede dejarlo pasar sin perderlo.
		expect(html).toContain(REQUERIDO.title);
		expect(html).toContain(REQUERIDO.body);
		expect(html).toContain(strings.announcements.requiredBadge);
		expect(html).toContain(strings.announcements.requiredHint);
	});

	test("entender es lo único que lo saca, y se lo lleva el id del aviso", () => {
		pintar(requerido(REQUERIDO));

		tocar();

		expect(entendidos).toEqual([REQUERIDO.id]);
		// Un solo callback de escritura: el descarte de un `required` no existe,
		// porque no hay fila donde descartarlo.
		expect(descartados).toEqual([]);
	});

	test("mientras se escribe, el aviso sigue en pantalla y el botón está ocupado", async () => {
		let liberar: () => void = () => {};
		pintar(requerido(REQUERIDO), {
			onAcknowledge: async () =>
				new Promise<void>((resolve) => {
					liberar = resolve;
				}),
		});

		tocar();

		// El aviso NO se saca antes de que el servidor confirme: hacerlo
		// cerraría un obligatorio como entendido sin estarlo, y como el
		// acknowledgement no se puede deshacer no volvería nunca más.
		expect(repintar(requerido(REQUERIDO))).toContain(REQUERIDO.title);
		expect(boton().loading).toBe(true);

		liberar();
		await flush();
		repintar(requerido(REQUERIDO));

		// Confirmado, el botón se devuelve: el modal ya lo sacó la cola.
		expect(boton().loading).toBe(false);
	});

	test("si la escritura falla, el aviso sigue con el motivo y sin cerrarse", async () => {
		falloAck = new Error("sin red");
		pintar(requerido(REQUERIDO));

		tocar();
		await flush();
		const reintento = repintar(requerido(REQUERIDO));

		// El modal NO se esconde: la persona necesita ver por qué no se guardó
		// para poder reintentar. Y el motivo es el copy de la app, no el texto
		// crudo del driver en inglés, que la taxonomía del mapper prohíbe
		// mostrar.
		expect(reintento).toContain(strings.announcements.acknowledgeFailed);
		expect(reintento).not.toContain("sin red");
		expect(reintento).toContain(REQUERIDO.title);
		expect(boton().children).toBe(strings.announcements.acknowledge);
		expect(boton().loading).toBe(false);
	});
});

describe("el lote de info: un botón que avanza y al final descarta el lote", () => {
	test("descarta los TRES ids de un golpe, y solo ese callback", () => {
		pintar(lote(LOTE));

		// El botón avanza de página en vez de descartar: descartar en la primera
		// dejaría dos avisos sin haberlos mostrado nunca, que es un descarte que
		// no es un descarte.
		tocarYAvanzar(lote(LOTE));
		tocarYAvanzar(lote(LOTE));
		expect(descartados).toEqual([]);

		expect(boton().children).toBe(strings.announcements.dismissBatch);
		tocar();

		// EL LOTE ENTERO, no el primero: descartar uno y no los otros los
		// devolvería en la próxima apertura, y el único aviso que no volvería
		// sería el que la persona sí llegó a ver.
		expect(descartados).toEqual([IDS_DEL_LOTE]);
		expect(entendidos).toEqual([]);
	});

	test("el lote muestra cuántas páginas quedan", () => {
		pintar(lote(LOTE));
		expect(html).toContain(pagina(1, LOTE.length));
		expect(boton().children).toBe(strings.announcements.nextPage);

		tocar();
		expect(repintar(lote(LOTE))).toContain(pagina(2, LOTE.length));

		tocar();
		expect(repintar(lote(LOTE))).toContain(pagina(3, LOTE.length));
	});

	test("cada página muestra su propio título y su propio cuerpo", () => {
		pintar(lote(LOTE));
		expect(html).toContain(LOTE[0].title);
		expect(html).toContain(LOTE[0].body);
		expect(html).not.toContain(LOTE[1].title);

		tocar();
		const segunda = repintar(lote(LOTE));
		expect(segunda).toContain(LOTE[1].title);
		expect(segunda).toContain(LOTE[1].body);
		expect(segunda).not.toContain(LOTE[0].title);
	});

	test("un aviso solo no muestra contador y su botón ya es el de cerrar", () => {
		const uno = [informado(1)];
		pintar(lote(uno));

		// "1 de 1" es ruido: no hay nada más que ver, y un contador que no
		// informa nada hace creer que hay un lote detrás del que se está viendo.
		expect(html).not.toContain(strings.announcements.pageCount);
		expect(html).not.toContain("1 de 1");
		expect(boton().children).toBe(strings.announcements.dismissBatch);

		tocar();
		expect(descartados).toEqual([uno.map((a) => a.id)]);
	});

	test("el informativo no promete nada ni pide escribir nada", () => {
		pintar(lote(LOTE));

		// Lo contrario del `required`, y lo que el rótulo tiene que decir: acá no
		// hay nada que entender, hay algo que leer. Si el rótulo fuera el del
		// obligatorio, la diferencia de las dos pantallas dejaría de existir.
		expect(html).toContain(strings.announcements.infoBadge);
		expect(html).not.toContain(strings.announcements.requiredBadge);
		expect(html).not.toContain(strings.announcements.acknowledge);
		expect(html).not.toContain(strings.announcements.requiredHint);
	});

	test("el gesto de atrás descarta el lote entero", () => {
		pintar(lote(LOTE));

		// Al revés que el `required`: un informativo no tiene nada que recordar,
		// así que el gesto de atrás es el mismo descarte que el botón — con los
		// TRES ids, nunca con el de la página que se estaba viendo.
		gestoDeAtras();

		expect(descartados).toEqual([IDS_DEL_LOTE]);
		expect(entendidos).toEqual([]);
	});

	test("el informativo tampoco tiene fondo tocable", () => {
		pintar(lote(LOTE));

		// Un fondo que cerrara sería un SEGUNDO gesto de descarte, y el descarte
		// es una escritura: dos caminos para la misma invitación a que uno se
		// escriba y el otro no.
		expect(pressables).toHaveLength(0);
		expect(buttons).toHaveLength(1);
	});
});

describe("lo que el tipo permite y el dominio garantiza", () => {
	test("un lote vacío no monta nada", () => {
		// `{ kind: "info", announcements: [] }` es legal para el tipo aunque
		// `buildModalSequence` nunca lo arme. Un modal con el cuerpo vacío sería
		// una pantalla ocupada sin nada que decir.
		expect(pintar(lote([]))).toBe("");
		expect(entendidos).toEqual([]);
		expect(descartados).toEqual([]);
	});

	test("la página se recorta contra el tamaño real del lote", () => {
		pintar(lote(LOTE));
		tocarYAvanzar(lote(LOTE));
		expect(tocarYAvanzar(lote(LOTE))).toContain(LOTE[2].title);

		// El lote se acortó con la página 3 abierta (un descarte parcial, una
		// relectura con el aviso nuevo en cabeza). El recorte es lo que evita
		// pintar un aviso que ya no está.
		const recortado = repintar(lote(LOTE.slice(0, 2)));
		expect(recortado).toContain(LOTE[1].title);
		expect(boton().children).toBe(strings.announcements.dismissBatch);
	});
});
