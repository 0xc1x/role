import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
	DISCOUNT_MAX_CLAIM,
	DISCOUNT_MAX_PERCENT,
	DISCOUNT_MIN_PERCENT,
	DISCOUNT_RANGE,
	DISCOUNT_SAVINGS_CLAIM,
} from "@0xc1x/role-commons";
import { FAQ_ITEMS, LAUNCH_CITIES } from "../faq";

// Archivos de copy que publicaban una cifra de descuento propia. Cada uno tiene
// que tomar el claim de `commons`; ninguno puede escribir un porcentaje suelto.
//
// El de mobile entra acá a propósito. La deriva original no fue un accidente:
// el claim vivía en un archivo por app, así que cambiarlo en el sitio no
// obligaba a cambiarlo en la app y el compilador no decía nada. Mobile
// publicaba "Ahorra hasta un 70%", "hasta 70% de descuento" y "menos de la
// mitad del precio original" mientras el sitio ya decía otra cosa. Barrer las
// dos apps desde un solo test es lo que evita la próxima.
const COPY_SOURCES = [
	"../../components/features.tsx",
	"../../components/hero.tsx",
	"../../components/how-it-works.tsx",
	"../../routes/how-it-works.tsx",
	"../../routes/help-center.tsx",
	"../../routes/about.tsx",
	"../../routes/__root.tsx",
	"../../../../mobile/src/core/i18n/strings.ts",
];

/**
 * Los archivos que son superficie de marketing puro: ahí cualquier porcentaje
 * suelto es un claim en competencia, y el chequeo puede ser estricto.
 *
 * Mobile queda fuera a propósito, porque su catálogo mezcla copy de marketing
 * con límites funcionales — "el porcentaje máximo es 100%" de los cupones no
 * es un claim de descuento. Ampliar el chequeo a todo el archivo marcaba como
 * offence un dato real y obliga a relajar el guard justo cuando empieza a
 * doler. Para mobile el guard preciso es la comprobación de redacciones
 * prohibidas, que sí lo cubre.
 */
const MARKETING_SOURCES = [
	"../../components/features.tsx",
	"../../components/hero.tsx",
	"../../components/how-it-works.tsx",
	"../../routes/how-it-works.tsx",
	"../../routes/help-center.tsx",
	"../../routes/about.tsx",
	"../../routes/__root.tsx",
];

const MOBILE_STRINGS = "../../../../mobile/src/core/i18n/strings.ts";

const sources = COPY_SOURCES.map((rel) => ({
	rel,
	text: readFileSync(new URL(rel, import.meta.url), "utf8"),
}));

const marketingSources = MARKETING_SOURCES.map((rel) => ({
	rel,
	text: readFileSync(new URL(rel, import.meta.url), "utf8"),
}));

/** Porcentajes que aparecen en prosa, ignorando los de código (discountPct, etc.). */
const PROSE_PERCENT = /(\d+)\s*%/g;

describe("un único claim de descuento", () => {
	test("las constantes dicen lo que dicen", () => {
		expect(DISCOUNT_RANGE).toBe("50% y 55%");
		expect(DISCOUNT_SAVINGS_CLAIM).toBe("entre 50% y 55% menos");
		expect(DISCOUNT_MAX_CLAIM).toBe("hasta 55%");
		expect(DISCOUNT_MIN_PERCENT).toBeLessThan(DISCOUNT_MAX_PERCENT);
	});

	test("ningún archivo de marketing afirma un porcentaje fuera del rango canónico", () => {
		const allowed = new Set([
			`${DISCOUNT_MIN_PERCENT}`,
			`${DISCOUNT_MAX_PERCENT}`,
		]);
		const offenders: string[] = [];

		for (const { rel, text } of marketingSources) {
			for (const match of text.matchAll(PROSE_PERCENT)) {
				if (!allowed.has(match[1])) offenders.push(`${rel}: ${match[0]}`);
			}
		}

		expect(offenders).toEqual([]);
	});

	test("la recomendación de descuento al comercio no contradice el claim al consumidor", () => {
		// Mobile decía "recomendamos ofrecer al menos un 30-50%": si un comercio
		// ofrece 30%, el ahorro que el consumidor ve es 30% y el "50% y 55%"
		// del sitio es falso para esa oferta. La guía al comercio tiene que salir
		// del mismo piso que el claim, así que se construye desde la constante.
		//
		// No se puede comprobar la frase literal: al venir de una constante se
		// arma por concatenación en runtime y no aparece en el fuente. Lo que se
		// verifica es que el número desapareció y que sale del piso compartido.
		const mobile = readFileSync(
			new URL(MOBILE_STRINGS, import.meta.url),
			"utf8",
		);
		expect(mobile).toContain("DISCOUNT_MIN_PERCENT");
		expect(mobile).not.toContain("30-50%");
	});

	test("las cuatro redacciones que se contradecían ya no existen", () => {
		const removed = [
			"hasta 70%",
			"50% hasta 70%",
			"entre 50% y 70%",
			"un tercio del precio",
			"mitad de precio",
			"menos de la mitad",
		];
		const offenders: string[] = [];

		for (const { rel, text } of sources) {
			const haystack = text.toLowerCase();
			for (const phrase of removed) {
				if (haystack.includes(phrase)) offenders.push(`${rel}: ${phrase}`);
			}
		}

		expect(offenders).toEqual([]);
	});

	test("cada archivo que menciona el descuento usa la constante compartida", () => {
		// Los cinco sitios con el claim en prosa + el meta social (forma corta).
		const users = marketingSources.filter(
			({ text }) =>
				text.includes("DISCOUNT_SAVINGS_CLAIM") ||
				text.includes("DISCOUNT_MAX_CLAIM"),
		);
		expect(users.map((u) => u.rel).sort()).toEqual(
			[
				"../../components/features.tsx",
				"../../components/hero.tsx",
				"../../components/how-it-works.tsx",
				"../../routes/__root.tsx",
				"../../routes/about.tsx",
				"../../routes/help-center.tsx",
				"../../routes/how-it-works.tsx",
			].sort(),
		);

		// Mobile usa la misma constante, desde commons, para los dos claims.
		const mobileText = readFileSync(
			new URL(MOBILE_STRINGS, import.meta.url),
			"utf8",
		);
		expect(mobileText).toContain("DISCOUNT_SAVINGS_CLAIM");
		expect(mobileText).toContain("DISCOUNT_MAX_CLAIM");
	});
});

describe("claims de comisión y geografía", () => {
	const landing = sources.map((s) => s.text).join("\n");

	test("el sitio ya no afirma que no hay comisiones", () => {
		const forbidden = [
			"sin comisiones sobre el cobro",
			"sin comisiones ocultas",
			"comisiones ocultas",
		];
		for (const phrase of forbidden) {
			expect(landing.toLowerCase()).not.toContain(phrase);
		}
	});

	test("la comisión por bolsa se explica, con el mismo modelo que el FAQ", () => {
		expect(FAQ_ITEMS.find((f) => f.q === "¿Cuánto cuesta?")?.a).toContain(
			"comisión por bolsa",
		);
	});

	test("la geografía del FAQ no nombra ciudades fuera de app_config", () => {
		const answer = FAQ_ITEMS.find((f) => f.q === "¿Dónde operan?")?.a ?? "";

		// Espejo de app_config['contact.cities'], en el mismo orden. El primero
		// importa: es la principal y la que se abre primero, así que el orden
		// del config es información, no decoración.
		expect(LAUNCH_CITIES).toEqual([
			"Santo Domingo",
			"Quito",
			"Guayaquil",
			"Cuenca",
			"Manta",
		]);

		for (const city of LAUNCH_CITIES) {
			expect(answer).toContain(city);
		}

		// "Otra" no es una ciudad de lanzamiento: la landing la agrega al form.
		expect(LAUNCH_CITIES).not.toContain("Otra");
	});
});
