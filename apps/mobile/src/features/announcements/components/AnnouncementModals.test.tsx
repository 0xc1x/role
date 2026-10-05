import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
// @ts-expect-error react-dom is installed without @types/react-dom in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error react-native-web does not ship declarations in this workspace.
import * as nativeWeb from "react-native-web";
import type { Announcement } from "@0c1x/role-commons";

import { light } from "@/src/core/theme/colors";
import { mockNativeUi } from "@/src/test-utils/native-mocks";

import { modalIdentity, type AnnouncementModal } from "../domain/announcement";

// El montaje: qué modal se abre y a qué callback va cada gesto.
//
// Estos tests EJECUTAN el componente. La receta es la de
// `blank-screens.test.tsx` —el hook falso, `renderToStaticMarkup` y afirmar
// sobre el HTML— y la razón por la que existe ese archivo es esta: el invariante
// más importante del montaje, "nadie puede cruzar los dos callbacks", estaba
// sostenido por un `toContain` sobre el texto del `_layout.tsx`, que pasa igual
// con el cableado al revés. Ejecutando el host, el cruce se rompe solo.
//
// Lo que este archivo NO puede comprobar es DÓNDE se monta el JSX —dentro o
// fuera del `<Stack>`— porque el host no sabe dónde lo ponen. Eso vive en
// `layout.mount.test.ts`, que sí lee el archivo del layout.

type ShellProbe = {
	visible?: boolean;
	onRequestClose?: () => void;
	children?: ReactNode;
};

type ButtonProbe = {
	onPress?: () => void;
	children?: ReactNode;
};

type DialogProbe = {
	modal: AnnouncementModal;
	onAcknowledge: (id: string) => Promise<void>;
	onDismissInfo: (ids: string[]) => void;
};

let shells: ShellProbe[] = [];
let buttons: ButtonProbe[] = [];
let dialogs: DialogProbe[] = [];
let html = "";

mockNativeUi({
	Platform: { OS: "ios" },
	Modal: (props: ShellProbe) => {
		shells.push(props);
		return props.visible === false
			? null
			: createElement(nativeWeb.View, null, props.children);
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

// El `dialog` se dobla para que el test lea a dónde fue cada gesto SIN volver a
// implementarlo: la segunda mitad —qué hace el dialog con cada callback— ya la
// cubre `AnnouncementDialog.test.tsx` con el dialog real. Acá lo que se prueba
// es el cableado del host.
let entendidos: string[] = [];
let descartados: string[][] = [];

mock.module("../components/AnnouncementDialog", () => ({
	AnnouncementDialog: (props: DialogProbe) => {
		dialogs.push(props);
		const titulo =
			props.modal.kind === "required"
				? props.modal.announcement.title
				: (props.modal.announcements[0]?.title ?? "");
		return createElement(
			nativeWeb.View,
			null,
			createElement(nativeWeb.Text, null, titulo),
		);
	},
}));

// ── La cola que el host ve ──────────────────────────────────────────────────

let modales: AnnouncementModal[] = [];

/**
 * Las dos funciones se declaran UNA vez y no dentro del mock: si el hook
 * devolviera un objeto nuevo con closures nuevas en cada llamada, el `toBe` de
 * "el dialog recibe la función del hook" compararía dos closures distintos y
 * no afirmaría nada. Con referencias estables, la identidad sí es comparable.
 */
const acknowledge = async (id: string) => {
	entendidos.push(id);
};
const dismissInfo = (ids: string[]) => {
	descartados.push(ids);
};

const useAnnouncementModals = mock(() => ({
	modals: modales,
	acknowledge,
	dismissInfo,
}));
// Se dobla el HOOK, no el barril entero: `firstPendingModal` y `modalIdentity`
// son puras y están testeadas en su propio archivo, así que duplicarlas acá
// sería probar el doble. Lo que este archivo vigila es que el host llame a la
// cola como se debe y cablee los gestos a lo que el hook expone.
mock.module("../hooks", () => ({
	useAnnouncementModals,
}));

const { AnnouncementModals } = await import("../components/AnnouncementModals");

// ── Avisos de prueba ────────────────────────────────────────────────────────

function aviso(
	id: string,
	severity: "required" | "info",
	title: string,
): Announcement {
	return {
		id,
		title,
		body: `Cuerpo de ${title}.`,
		severity,
		audience_kind: "all",
		priority: 5,
		active: true,
		start_at: null,
		end_at: null,
		created_at: "2026-10-01T00:00:00.000Z",
		updated_at: "2026-10-01T00:00:00.000Z",
	};
}

const A = aviso("a0000000-0000-4000-8000-0000000000a1", "required", "Aviso A");
const B = aviso("a0000000-0000-4000-8000-0000000000a2", "required", "Aviso B");
const I1 = aviso("a0000000-0000-4000-8000-0000000000b1", "info", "Novedad 1");
const I2 = aviso("a0000000-0000-4000-8000-0000000000b2", "info", "Novedad 2");

const requerido = (announcement: Announcement): AnnouncementModal => ({
	kind: "required",
	announcement,
});
const lote = (announcements: Announcement[]): AnnouncementModal => ({
	kind: "info",
	announcements,
});

// ── Harness ────────────────────────────────────────────────────────────────

function montar(): string {
	dialogs = [];
	buttons = [];
	shells = [];
	html = renderToStaticMarkup(createElement(AnnouncementModals));
	return html;
}

/** El dialog que se montó, o un error si no se montó ninguno. */
function dialog(): DialogProbe {
	if (dialogs.length !== 1) {
		throw new Error(
			`se esperaba un dialog y hay ${dialogs.length}: no se abre un modal por render`,
		);
	}
	return dialogs[0];
}

beforeEach(() => {
	modales = [];
	entendidos = [];
	descartados = [];
	dialogs = [];
	buttons = [];
	shells = [];
	html = "";
});

describe("sin cola no hay modal", () => {
	test("la cola vacía no monta nada", () => {
		// El arranque de la app pasa por acá: el hook devuelve `[]` antes de que
		// la consulta haya resuelto. Un dialog con una cola vacía sería una
		// pantalla ocupada sin nada que decir.
		expect(montar()).toBe("");
		expect(dialogs).toHaveLength(0);
	});

	test("un fallo de la consulta tampoco abre nada", () => {
		// D7: el hook deja `modals` en `[]` ante un fallo y la app abre igual.
		// La cola vacía es el mismo camino, y por eso el mismo `null`.
		modales = [];

		expect(montar()).toBe("");
		expect(shells).toHaveLength(0);
	});
});

describe("el required de la cabeza es el que se abre, de a uno", () => {
	test("con dos required se abre el primero y solo el primero", () => {
		modales = [requerido(A), requerido(B)];

		montar();

		expect(dialog().modal).toEqual(requerido(A));
		// El segundo NO se pinta junto: el orden de D9 y D10 es "de a uno", y una
		// apertura con dos `required` montados sería una pantalla con dos avisos
		// obligatorios encima.
		expect(html).toContain("Aviso A");
		expect(html).not.toContain("Aviso B");
	});

	test("el botón del primero va a acknowledge y no toca el segundo", async () => {
		// LA COSTURA DEL INVARIANTE 2. Con los dos `required` en la cola, un
		// cableado cruzado se vería: `dismissInfo` recibiría el id del primero y el
		// `required` del segundo quedaría sin tocar, que es un descarte que no
		// descarta nada.
		modales = [requerido(A), requerido(B)];

		montar();
		await dialog().onAcknowledge(
			dialog().modal.kind === "required" ? A.id : "",
		);

		expect(entendidos).toEqual([A.id]);
		// `dismissInfo` intacto: entender un `required` nunca descarta nada, y el
		// id que se registró es el del aviso que se estaba viendo, no el de otro.
		expect(descartados).toEqual([]);
		expect(entendidos).not.toContain(B.id);
	});

	test("entender el primero deja al segundo como el que se abre", () => {
		// No hay índice que se avance: el acknowledgement saca su modal de la cola
		// y el siguiente aparece solo. Por eso no hay puntero que pueda
		// desincronizarse y saltear al segundo.
		modales = [requerido(A), requerido(B)];
		montar();

		modales = [requerido(B)];
		montar();

		expect(dialog().modal).toEqual(requerido(B));
		expect(html).toContain("Aviso B");
	});
});

describe("el lote de info llega a dismissInfo con los ids enteros", () => {
	test("el descarte lleva el lote completo, no el aviso de la página", () => {
		modales = [lote([I1, I2])];

		montar();
		dialog().onDismissInfo([I1.id, I2.id]);

		// Descartar uno y no el otro lo devolvería en la próxima apertura, y el
		// único aviso que no volvería sería el que la persona llegó a ver.
		expect(descartados).toEqual([[I1.id, I2.id]]);
		// Y el reconocimiento de un `required` no se toca: son dos stores
		// distintos para dos severidades distintas.
		expect(entendidos).toEqual([]);
	});

	test("el lote solo se abre cuando ya no queda ningún required", () => {
		// El lote va último en la secuencia, así que un `required` pendiente lo
		// tapa. Abrir el lote primero dejaría el obligatorio para después.
		modales = [requerido(A), lote([I1, I2])];

		montar();

		expect(dialog().modal).toEqual(requerido(A));
		expect(html).not.toContain("Novedad 1");

		modales = [lote([I1, I2])];
		montar();

		expect(dialog().modal).toEqual(lote([I1, I2]));
		expect(html).toContain("Novedad 1");
	});
});

describe("la identidad del modal es lo que se monta", () => {
	test("el dialog montado es el de la cabeza, con la identidad de su aviso", () => {
		// SIN KEY —y sin avance de página: React se queda con el nodo y el estado
		// interno del dialog —la página del lote, el "escondido sin resolver" del
		// `required`— sobrevive de un aviso al siguiente. Es el estado lo que no
		// puede cruzar de un modal a otro.
		modales = [requerido(A)];
		montar();

		expect(dialog().modal).toEqual(requerido(A));
		expect(modalIdentity(dialog().modal)).toBe(`required:${A.id}`);

		modales = [lote([I1, I2])];
		montar();

		expect(modalIdentity(dialog().modal)).toBe(`info:${I1.id}`);
		expect(modalIdentity(dialog().modal)).not.toBe(`required:${A.id}`);
	});

	test("cambiar de aviso cambia la identidad, aunque la posición sea la misma", () => {
		// La posición 0 con otro aviso: un nodo reutilizado mostraría el aviso
		// nuevo con el estado del anterior —un `info` en la página 3 de una lista
		// que ya no tiene tres páginas, o un `required` que la persona ya cerró
		// sin entenderlo apareciendo invisible.
		modales = [requerido(A)];
		montar();
		const primera = modalIdentity(dialog().modal);

		modales = [requerido(B)];
		montar();

		expect(modalIdentity(dialog().modal)).not.toBe(primera);
	});
});

describe("el host no escribe nada por su cuenta", () => {
	test("los dos gestos del dialog son los dos del hook, sin nada en el medio", () => {
		// Si el host envolviera los callbacks para filtrar o translating, el
		// `id` que llega al repository dejaría de ser el del aviso mostrado. Se
		// afirma que son las funciones del hook, sin identidad intermedia.
		modales = [requerido(A)];
		montar();

		const api = useAnnouncementModals();
		expect(dialog().onAcknowledge).toBe(api.acknowledge);
		expect(dialog().onDismissInfo).toBe(api.dismissInfo);
	});

	test("el aviso llega al dialog sin reescribir su texto", () => {
		// El modal muestra lo que el operador escribió en el panel; el rótulo y la
		// línea de D7 los agrega el dialog, no el host. Con un título inventado acá
		// el HTML que se afirma en los tests de arriba no significaría nada.
		modales = [requerido(A)];
		montar();

		expect(dialog().modal).toEqual(requerido(A));
		expect(html).toContain("Aviso A");
	});
});
