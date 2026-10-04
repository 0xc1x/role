import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * El montaje en `app/_layout.tsx`. Es la primera vez que la persona ve el
 * feature, así que las dos reglas del montaje están acá y no en el JSX:
 *
 *  1. **Va en el layout, no en una ruta.** Una pila de avisos no es "una
 *     pantalla": en una ruta, el gesto de atrás del sistema cerraría algo que
 *     no está en el stack de navegación, y además el primer aviso no aparecería
 *     hasta que el router resolviera la ruta inicial — que es justo cuando la
 *     persona está mirando. Montado en el layout se ve desde la primera
 *     pantalla, la que sea.
 *
 *  2. **Una consulta por arranque, no una por pantalla.** La clave es que lo
 *     monte el layout, que no se desmonta al navegar. Montado en una pantalla
 *     sería una lectura por navegación, y una lectura por navegación es un
 *     `required` que aparece a mitad de un checkout.
 *
 * Y una tercera, que es la que más se rompe sin que nadie lo note: se pinta UN
 * modal, el primero de la cola. Si el layout pintara la secuencia entera, una
 * apertura con tres `required` muestra los tres de una, y el orden de D9 y D10
 * —que el dominio decidió de a uno— no significaría nada en pantalla.
 *
 * Estos tests son de FUENTE a propósito: montar el layout raíz en `bun test`
 * significa levantar Expo Router, Sentry, las fuentes y el tema, y lo que se
 * quiere fijar acá son decisiones de montaje —dónde vive, cuántas veces se
 * monta, cuántos modales pinta— que son de lectura del archivo y no de su
 * ejecución. Lo que el componente hace con el modal ya está cubierto en
 * `components/AnnouncementDialog.test.tsx`, y lo que hace con la cola en
 * `domain/announcement.test.ts` y `hooks.test.tsx`.
 */

const LAYOUT = join(import.meta.dir, "..", "..", "..", "app", "_layout.tsx");
const source = readFileSync(LAYOUT, "utf8");

/** El cuerpo de la función que monta los avisos, sin su firma. */
function cuerpo(): string {
	const match = source.match(/function AnnouncementModals\(\)[\s\S]*?\n}\n/);
	if (!match) {
		throw new Error(
			"app/_layout.tsx no monta los avisos: no se encontró AnnouncementModals()",
		);
	}
	return match[0];
}

describe("los avisos se montan en el layout raíz", () => {
	test("no hay ruta de avisos", () => {
		// La falla que motivó el montaje en el layout: `app/announcements.tsx`
		// existe o existió como ruta, y con ella el gesto de atrás del sistema
		// cerraba un modal fuera del stack de navegación.
		const index = readdirSync(join(import.meta.dir, "..", "..", "..", "app"));
		expect(index.filter((n) => n.startsWith("announcement"))).toEqual([]);
	});

	test("el componente se monta una vez, junto al stack y no dentro de él", () => {
		// Junto al `<Toaster />` y FUERA del `<Stack>`: dentro del stack el
		// router lo associates a una pantalla y lo desmonta al navegar, que es
		// justo lo que hace que la lectura vuelva a ser por navegación.
		expect(source).toContain("<AnnouncementModals />");
		expect(cuerpo()).toContain("useAnnouncementModals()");
	});

	test("el montaje lee el hook una sola vez", () => {
		// Una lectura por montaje del layout, no una por modal ni por pantalla.
		const lecturas = cuerpo().match(/useAnnouncementModals\(\)/g) ?? [];
		expect(lecturas).toHaveLength(1);
	});
});

describe("el montaje pinta un modal, y es el primero de la cola", () => {
	test("la decisión de cuál se abre no está en el JSX del layout", () => {
		// Inline, esto solo se ejercita levantando Expo Router, y es la decisión
		// que sostiene el orden de D9 y D10 en pantalla. Sale del layout y vive en
		// el dominio, donde hay test.
		expect(cuerpo()).toContain("firstPendingModal(modals)");
		expect(source).toContain('from "@/src/features/announcements"');
	});

	test("no hay índice ni puntero que se advance a mano", () => {
		// La falla que esto tapa: un puntero al modal abierto avanza por su cuenta,
		// y se desincroniza de la cola en cuanto algo la cambia por otra vía —un
		// descarte, una relectura—. Se saltea un `required`, o se queda
		// mostrando uno ya entendido.
		expect(cuerpo()).not.toMatch(/useState.*modal|setIndice|indice|setCursor/);
	});

	test("no pinta la secuencia entera", () => {
		// Con `modals.map(...)` una apertura con tres `required` los muestra de
		// una, y el "de a uno y primero" del dominio no significaría nada en
		// pantalla.
		expect(cuerpo()).not.toMatch(/modals\.map|modals\.forEach/);
	});

	test("la key del modal sale de su identidad, no de su posición", () => {
		expect(cuerpo()).toContain("key={modalIdentity(modal)}");
	});
});

describe("el montaje cablea los dos gestos a dos callbacks distintos", () => {
	test("el entender va a `acknowledge` y el descartar a `dismissInfo`", () => {
		// Si los dos gestos compartieran handler, cerrar un `required` lo sacaría
		// de la cola sin haberse entendido, y no volvería nunca: es la falla
		// inversa exacta a la que la migración prohíbe.
		expect(cuerpo()).toContain("onAcknowledge={acknowledge}");
		expect(cuerpo()).toContain("onDismissInfo={dismissInfo}");
		expect(cuerpo()).not.toMatch(/onAcknowledge=\{dismissInfo\}/);
		expect(cuerpo()).not.toMatch(/onDismissInfo=\{acknowledge\}/);
	});

	test("el layout no escribe nada por su cuenta", () => {
		// Ni una escritura propia: el acknowledgement lo sostiene la policy de la
		// base y el descarte local es un id en el dispositivo. Un `fetch` o un
		// `supabase` acá sería una segunda ruta de escritura.
		expect(cuerpo()).not.toMatch(/supabase|fetch\(|AsyncStorage/);
	});
});
