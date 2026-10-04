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
const source = readFileSync(LAYOUT, "utf8");

/** El cuerpo de la función que define el stack raíz del layout. */
function cuerpoStack(): string {
	return source.match(/function ThemedRootStack\(\)[\s\S]*?\n}\n/)?.[0] ?? "";
}

describe("los avisos se montan en el layout raíz", () => {
	test("no hay ruta de anuncios", () => {
		// La falla que motivó el montaje en el layout: `app/announcements.tsx`
		// existe o existió como ruta, y con ella el gesto de atrás del sistema
		// cerraba un modal fuera del stack de navegación — algo que no está en el
		// stack, así que el gesto no tiene a qué volver.
		const index = readdirSync(join(import.meta.dir, "..", "..", "..", "app"));
		expect(index.filter((n) => n.startsWith("announcement"))).toEqual([]);
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
		// stack, no un hijo suyo. Con el host declarado después de
		// `ThemedRootStack`, el JSX quedaría dentro.
		expect(source.indexOf("<AnnouncementModals />")).toBeLessThan(
			source.indexOf("function ThemedRootStack()"),
		);
	});
});
