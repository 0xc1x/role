import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTES: Record<string, string> = {
	// index.tsx delega a componentes; verificar su ensamblaje en vez de texto.
	"/": "LandingPage",
	"/about": "Sobre nosotros",
	"/how-it-works": "¿Cómo funciona Rolé?",
	// El h1 parte la frase con un span estilizado; el marker cubre hasta "en".
	"/for-business": "Convierte tu excedente en",
	"/help-center": "Centro de ayuda",
	"/privacy": "Política de",
	"/terms": "Términos y",
};

describe("landing routes", () => {
	it("cada ruta registrada tiene archivo y su contenido esperado", () => {
		for (const [route, marker] of Object.entries(ROUTES)) {
			const file = route === "/" ? "index" : route.slice(1);
			const source = readFileSync(
				resolve(__dirname, `../${file}.tsx`),
				"utf-8",
			);
			expect(source).toContain(marker);
		}
	});
});
