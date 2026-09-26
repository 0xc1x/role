import { describe, expect, it } from "bun:test";
import { PLATFORM_CURRENCY } from "../enums/platform-currency";

/**
 * `PLATFORM_CURRENCY` es el único rótulo de dinero del ecosistema, así que este
 * spec no prueba una cadena: prueba que la cadena SIRVA para lo que se le pide.
 * Un valor que `Intl` no acepta degrada en silencio (lanza al construir el
 * formatter, en el render, no en el servidor) y un valor al que `Intl` le
 * resuelve otra cosa deja al operador leyendo una moneda que no es.
 */

/** ISO 4217: tres letras ASCII en mayúsculas. */
const ISO_4217 = /^[A-Z]{3}$/;

describe("PLATFORM_CURRENCY", () => {
	it("es un código ISO 4217 de tres letras en mayúsculas", () => {
		expect(PLATFORM_CURRENCY).toMatch(ISO_4217);
	});

	it("Intl lo acepta y lo resuelve sin cambiarlo", () => {
		const formatter = new Intl.NumberFormat("es-EC", {
			style: "currency",
			currency: PLATFORM_CURRENCY,
		});

		// `resolvedOptions` es la prueba real: si el código no existiera,
		// `Intl` habría lanzado al construir; si no lo reconociera, habría
		// resuelto otra moneda y el rótulo mentiría.
		expect(formatter.resolvedOptions().currency).toBe(PLATFORM_CURRENCY);
	});

	it("el rótulo formateado muestra el código, no solo el símbolo", () => {
		// El defecto que motiva la constante: con `style: "currency"` a secas,
		// `es-EC` rinde "$1.234,50" y un "$" sin código no distingue USD de
		// MXN ni de COP. Con `currencyDisplay: "code"` la unidad es legible en
		// la propia cifra.
		const formatted = new Intl.NumberFormat("es-EC", {
			style: "currency",
			currency: PLATFORM_CURRENCY,
			currencyDisplay: "code",
		}).format(1234.5);

		expect(formatted).toContain(PLATFORM_CURRENCY);
	});

	it("es un literal único, no una variable reconfigurable por negocio", () => {
		// El tipo del export es el literal `"USD"`, así que asignarle otra
		// moneda no compila. Este spec fija el valor para que un cambio tenga
		// que pasar por acá y no por un default silencioso en otro lado.
		expect(PLATFORM_CURRENCY).toBe("USD");
		expect(PLATFORM_CURRENCY).toBe(PLATFORM_CURRENCY.toUpperCase());
	});
});
