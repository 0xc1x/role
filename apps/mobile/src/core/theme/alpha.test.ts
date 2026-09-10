import { describe, expect, test } from "bun:test";

import { withAlpha } from "./alpha";

describe("withAlpha", () => {
	test("aplica alpha a hex de 6 dígitos", () => {
		expect(withAlpha("#96BF85", 0.302)).toBe("#96BF854D");
		expect(withAlpha("#BF1C19", 0.051)).toBe("#BF1C190D");
		expect(withAlpha("#FFFFFF", 1)).toBe("#FFFFFFFF");
		expect(withAlpha("#FF4B4B", 0)).toBe("#FF4B4B00");
	});

	test("expande hex de 3 dígitos", () => {
		expect(withAlpha("#F00", 0.5)).toBe("#FF000080");
	});

	test("reemplaza un alpha preexistente", () => {
		expect(withAlpha("#131316B3", 0.2)).toBe("#13131633");
	});

	test("clampa alpha fuera de rango", () => {
		expect(withAlpha("#1A1A18", 2)).toBe("#1A1A18FF");
		expect(withAlpha("#1A1A18", -1)).toBe("#1A1A1800");
	});

	test("roundtrip con los sufijos usados por los tokens", () => {
		// Cada sufijo hex usado en la app debe poder reproducirse con un
		// alpha decimal exacto (evita drift visual en la migración).
		const suffixes = [
			"0A", "0D", "14", "1A", "26", "33", "4D", "73", "80", "90",
			"99", "B3", "BF", "CC", "E6", "E8", "EB", "F2",
		];
		for (const s of suffixes) {
			const alpha = Math.round((parseInt(s, 16) / 255) * 1000) / 1000;
			expect(withAlpha("#123456", alpha).slice(-2)).toBe(s);
		}
	});
});
