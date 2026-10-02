import { describe, expect, test } from "bun:test";
import { formatBusinessDate, formatBusinessDateTime } from "../dates";

/**
 * La guarda de `dates.ts` existe porque `Intl.DateTimeFormat.format` lanza
 * `RangeError: Invalid time value` sobre un `Date` inválido, y en un componente
 * de React eso sube hasta el `CatchBoundary` del ROOT: no se pierde la ficha,
 * se pierde el panel entero con su barra lateral.
 *
 * La cadena medida, sin que nadie la infiera del código: el mapper copia
 * `value.at` verbatim porque el contrato lo declara `z.string().nullable()` —o
 * sea `z.string().min(1)`, sin validación de formato— y el `WITH CHECK` de la
 * policy de insert no mira `value`. Un cliente escribe `at: "ayer"` y la fila
 * entra.
 */
describe("una fecha que no se puede formatear no tumba la pantalla", () => {
	test("formatBusinessDateTime devuelve el valor crudo en vez de tirar", () => {
		// Sin la guarda, esta línea es un `RangeError`, no un assert rojo.
		expect(() => formatBusinessDateTime("ayer")).not.toThrow();
		expect(formatBusinessDateTime("ayer")).toBe("ayer");
	});

	test("formatBusinessDate tiene la misma guarda", () => {
		// La misma llamada sin cubrir, usada por la columna "Recibido" de la
		// tabla: un RangeError en un `cell` se lleva la fila entera.
		expect(() => formatBusinessDate("no-es-fecha")).not.toThrow();
		expect(formatBusinessDate("no-es-fecha")).toBe("no-es-fecha");
	});

	test.each([
		["el texto que escribe un cliente a mano", "ayer"],
		["el string que sale de un JSON sin valor", "null"],
		["un número como texto", "0"],
		["una cadena vacía con espacios", "   "],
		["una fecha en formato que no es ISO", "20/09/2026"],
	])("%s no revienta", (_caso, raw) => {
		expect(() => formatBusinessDateTime(raw)).not.toThrow();
		expect(() => formatBusinessDate(raw)).not.toThrow();
	});

	test("NO devuelve un guion, que es la marca de 'sin informar'", () => {
		// El guion es lo que `DetailField` pinta cuando el campo vino `null`, así
		// que devolverlo desde acá fundiria "el cliente no mandó este campo" con
		// "el campo vino corrupto". Son hechos distintos: uno es un reporte viejo y
		// el otro es un bug que hay que reportar.
		expect(formatBusinessDateTime("ayer")).not.toBe("—");
	});

	test("las fechas válidas se siguen formateando igual que antes", () => {
		// La guarda no puede cambiar el texto de lo que ya funcionaba: una
		// regresión acá sería invisible en el.assert de arriba.
		expect(formatBusinessDate("2026-09-20T20:00:00.000Z")).toBe("20/9/2026");
		expect(formatBusinessDateTime("2026-09-20T20:00:00.000Z")).toBe(
			"20/9/26, 3:00 p. m.",
		);
	});
});
