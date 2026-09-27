import { describe, expect, it } from "bun:test";
import { PLATFORM_CURRENCY } from "@0xc1x/role-commons";
import { formatMoney, formatRate } from "../money";

/**
 * El rótulo de dinero es la única parte de la cifra que dice en qué unidad está:
 * el contrato no trae `currency`. Estos tests fijan las dos propiedades que lo
 * hacen auditable —el código visible y que venga del contrato— sin fijar la
 * forma regional exacta, que es responsabilidad de `Intl`.
 */

describe("formatMoney", () => {
	it("muestra el código de la moneda de la plataforma, no un símbolo suelto", () => {
		const formatted = formatMoney(1234.5);

		expect(formatted).toContain(PLATFORM_CURRENCY);
		// El defecto: "$1.234,50" no distingue USD de MXN ni de COP.
		expect(formatted).not.toBe("$1.234,50");
	});

	it("usa la moneda de commons, no la del negocio ni un literal", () => {
		// Si alguien cambiara el rótulo a un literal, la cadena esperada dejaría de
		// coincidir: el mismo número, otra unidad.
		const expected = new Intl.NumberFormat("es-EC", {
			style: "currency",
			currency: PLATFORM_CURRENCY,
			currencyDisplay: "code",
		}).format(42);

		expect(formatMoney(42)).toBe(expected);
	});

	it("formatea el cero sin inventar un guion", () => {
		expect(formatMoney(0)).toContain("0");
	});
});

describe("formatRate", () => {
	it("muestra la fracción de la API como porcentaje", () => {
		// La API manda 0.1333 (fracción); un operador lee "13,33 %".
		expect(formatRate(0.1333)).toBe("13,33%");
		expect(formatRate(0)).toBe("0%");
	});
});
