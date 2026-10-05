import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * DÓNDE se monta el host de los avisos. Y solo eso.
 *
 * Todo lo demás del montaje —qué modal se abre, con qué identidad, y a qué
 * callback va cada gesto— se prueba EJECUTANDO `AnnouncementModals` en
 * `components/AnnouncementModals.test.tsx`. Este archivo existe porque hay una
 * cosa que ninguna prueba de ejecución puede afirmar: **dónde** se puso el JSX.
 *
 * Y no es una formalidad. El invariante del montaje es que el host NO se
 * desmonte al navegar, y eso depende de su posición en el árbol: dentro del
 * `<Stack>` el router lo desmonta al cambiar de pantalla, y eso es una lectura
 * por navegación — un `required` que aparece a mitad de un checkout. Un
 * `expect(source).toContain("<AnnouncementModals />")` pasa con el componente
 * dentro del stack igual que fuera: la cadena existe en los dos casos, lo único
 * que cambia es dónde. Estos tests lo miran estructuralmente.
 */

const LAYOUT = join(import.meta.dir, "..", "..", "..", "app", "_layout.tsx");
const APP_DIR = join(import.meta.dir, "..", "..", "..", "app");
const source = readFileSync(LAYOUT, "utf8");

/** El cuerpo de la función que define el stack raíz del layout. */
function cuerpoStack(): string {
	return source.match(/function ThemedRootStack\(\)[\s\S]*?\n}\n/)?.[0] ?? "";
}

/** Toda hoja de ruta de `app/`, por cualquier profundidad de grupos. */
function hojasDeRuta(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...hojasDeRuta(full));
		else if (/\.tsx$/.test(entry.name) && entry.name !== "_layout.tsx") {
			out.push(full);
		}
	}
	return out;
}

describe("los avisos se montan en el layout raíz", () => {
	test("ninguna hoja de ruta monta el host de los modales", () => {
		// LA AFIRMACIÓN QUE ESTABA, REHECHA. Antes este archivomiraba que no
		// existiera NINGÚN archivo `app/announcement*`, y el motivo era que el host
		// no puede vivir en una ruta: dentro del `<Stack>` el router la desmonta al
		// cambiar de pantalla y un `required` reaparece a mitad de un checkout.
		//
		// Ese motivo no cambió; lo que cambió es que ahora existe `app/announcements.tsx`,
		// que es la hoja de la LISTA. El filtro por nombre de archivo era un
		// sustituto del invariante y hoy marca un positivo falso sobre una pantalla
		// que no monta nada del host. Lo que se afirma ahora es el invariante: si
		// alguien monta `AnnouncementModals` en una ruta —en esta o en la que
		// aparezca mañana—, esto se pone rojo.
		const montajes = hojasDeRuta(APP_DIR).filter((hoja) =>
			readFileSync(hoja, "utf8").includes("<AnnouncementModals"),
		);

		expect(montajes).toEqual([]);
	});

	test("el host se monta una vez", () => {
		// Dos montajes serían dos consultas y dos modales compitiendo por la
		// pantalla; y el que se viería sería el último.
		const montajes = source.match(/<AnnouncementModals \/>/g) ?? [];
		expect(montajes).toHaveLength(1);
	});
});

describe("el host se monta FUERA del Stack, que es el invariante", () => {
	test("el cuerpo del Stack no lo menciona", () => {
		// LA AFIRMACIÓN QUE FALLA CON LA MUTACIÓN. Dentro del stack el router
		// desmonta al navegar y el aviso resucita a mitad de un checkout. Un
		// `toContain` sobre el archivo entero no lo distingue: la cadena está en
		// los dos casos, lo que cambia es dónde.
		expect(cuerpoStack()).not.toContain("AnnouncementModals");
	});

	test("y se monta antes de que el stack se defina", () => {
		// El orden en el archivo es el orden en el árbol: el host es hermano del
		// stack, no un hijo suyo. Y tiene que estar antes de la DECLARACIÓN de
		// `ThemedRootStack`, que en el archivo va DESPUÉS de `RootLayout`: puesto
		// después de esa función el JSX no caería "dentro del Stack" —caería fuera
		// de `RootLayout` entero, que ni compila—. O sea que lo que este test
		// afirma es el ORDEN, no el anidamiento; el anidamiento lo mira el de
		// arriba.
		expect(source.indexOf("<AnnouncementModals />")).toBeLessThan(
			source.indexOf("function ThemedRootStack()"),
		);
	});
});
