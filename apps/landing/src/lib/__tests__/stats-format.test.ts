/**
 * De dónde arranca el conteo del hero, y por qué no desde cero.
 *
 * El requisito que trajo esta función: cuando las cifras lleguen a miles,
 * empezar en `0` y contar hasta `18.847` no es una animación, es un glitch —
 * además es una mentira, porque el número ya existía antes de que abrieras la
 * pestaña. Y en `1.2 s` recorrido, un número de cinco dígitos se lee como un
 * glitch de render.
 *
 * Así que el conteo **solo mueve los dos últimos dígitos**. Los de arriba no se
 * tocan, y eso además garantiza el invariante de layout: el string formateado
 * tiene siempre la misma cantidad de caracteres, así que el `tabular-nums` del
 * hero no necesita `min-width` ni nada para no pasar CLS.
 *
 * Los números de una y dos cifras son el caso aparte: su rango es chico, así
 * que un salto proporcional se lee bien y no hay nada "de arriba" que preservar.
 */
import { describe, expect, test } from "bun:test";
import { countUpFrom, formatStat } from "../stats-format";

describe("formatStat", () => {
	test("formatea con separador de miles es-EC y sufijo +", () => {
		expect(formatStat(8)).toBe("8+");
		expect(formatStat(20)).toBe("20+");
		expect(formatStat(1847)).toBe("1.847+");
		expect(formatStat(18847)).toBe("18.847+");
	});

	test("sin dato devuelve el guion, no un cero", () => {
		// El `—` y el `0` tienen que seguir siendo distinguibles: el primero es
		// "la API no respondió", el segundo es "no hay nadie todavía".
		expect(formatStat(undefined)).toBe("—");
	});
});

describe("countUpFrom: los invariantes que el layout y la mentira dependen", () => {
	const VALUES = [
		1, 2, 7, 8, 14, 20, 42, 99, 100, 101, 128, 847, 999, 1000, 1204, 18847,
		1204000,
	];

	test("nunca supera el valor final", () => {
		for (const v of VALUES) {
			expect(countUpFrom(v)).toBeLessThanOrEqual(v);
		}
	});

	test("nunca es negativo, y un valor no positivo arranca en sí mismo", () => {
		expect(countUpFrom(0)).toBe(0);
		expect(countUpFrom(-5)).toBe(0);
		expect(countUpFrom(1)).toBeGreaterThanOrEqual(0);
		for (const v of VALUES) {
			expect(countUpFrom(v)).toBeGreaterThanOrEqual(0);
		}
	});

	test("SIEMPRE tiene la misma cantidad de dígitos que el final", () => {
		// Este es el invariante de CLS. Si el arranque tiene menos dígitos que el
		// final, el número crece un carácter a mitad del conteo y el bloque de
		// stats se desplaza en cada frame. Con `tabular-nums` eso no se arregla
		// solo: el contenedor sigue creciendo.
		for (const v of VALUES) {
			expect(String(countUpFrom(v)).length).toBe(String(v).length);
		}
	});

	test("con miles y millones solo se mueven los dos últimos dígitos", () => {
		// El requisito explícito: nada de contar de 0 a 1.204.000.
		for (const v of [1000, 1204, 18847, 1204000]) {
			const delta = v - countUpFrom(v);
			expect(delta).toBeLessThanOrEqual(99);
			expect(delta).toBeGreaterThanOrEqual(0);
		}
	});

	test("una cifra arranca bajo; dos quedan topadas por el piso de dígitos", () => {
		// El caso de HOY: los stats reales son 8, 14 y 20.
		//
		// Con UNA cifra el arranque es libre y va cerca del 10%: `8 → 1` son ocho
		// pasos y el conteo se lee. Con DOS cifras el piso de dígitos lo topa en
		// 10: `14 → 10` y `20 → 10` son cuatro y diez pasos respectivamente.
		//
		// Y eso es una tensión REAL entre dos invariantes, no una casualidad: un
		// arranque en 2 para un número de 20 haría `2+ → 20+`, creciendo un
		// carácter a mitad del conteo y moviendo el bloque de stats. Se eligió
		// CLS cero antes que un arranque más agresivo en dos cifras.
		expect(countUpFrom(8)).toBe(1);
		expect(countUpFrom(7)).toBe(1);

		expect(countUpFrom(20)).toBe(10);
		expect(countUpFrom(14)).toBe(10);
		expect(countUpFrom(99)).toBe(10);

		// Nunca en cero: "0+ usuarios" medio segundo es una mentira que el ojo
		// alcanza a leer antes de que el número la corrija.
		for (const v of [1, 8, 14, 20, 42, 99]) {
			expect(countUpFrom(v)).toBeGreaterThanOrEqual(1);
		}
	});

	test("un valor sin margen animable no se anima", () => {
		// 100 no puede arrancar en 99 sin perder un dígito. Preferimos no animar
		// antes que hacer crecer el número un carácter.
		expect(countUpFrom(100)).toBe(100);
	});
});
