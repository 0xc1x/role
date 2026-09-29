import { describe, expect, test } from "bun:test";
import { DEFAULT_API_URL, resolveApiUrl } from "../api-url";

/**
 * La regla de `VITE_API_URL`, que decide si el panel arranca o no.
 *
 * ─── Por qué este archivo existe ───────────────────────────────────────────
 *
 * El defecto que cubre no se manifiesta en el navegador: con la variable
 * rota, `env.ts` tiraba el `ZodError` al cargar el módulo, Vite levantaba
 * igual, y cada ruta respondía `500 {"message":"HTTPError"}` — el error real
 * solo aparecía en el stdout del dev server. Un panel mal configurado era
 * indistinguible de un panel roto, que es una trampa de diagnóstico.
 *
 * El arreglo mueve la validación al arranque (`vite.config.ts`), así que la
 * propiedad que hay que proteger es: "¿un valor inválido MUERE el arranque, y
 * uno ausente deja pasar con el default?". Estas aserciones son el lado
 * observable de esa decisión sin depender de la resolución de Vite.
 *
 * La cobertura del "muere el arranque" en sí (que `vite.config.ts` llame a esto
 * sin tragarse el error) la aporta el e2e y la verificación manual: mutar el
 * `catch` de `vite.config.ts` devuelve el bind de puerto y el 500 por ruta, que
 * es exactamente el defecto original.
 */
describe("VITE_API_URL", () => {
	describe("valor ausente", () => {
		test("usa el default de localhost y lo declara", () => {
			// El default es un punto a localhost: no puede apuntar a nada que el
			// dev no haya elegido, y `bun run build` en CI depende de que no sea
			// un error.
			const result = resolveApiUrl(undefined);
			expect(result.url).toBe(DEFAULT_API_URL);
			expect(result.usedDefault).toBe(true);
		});

		test("una variable vacía o en blanco cuenta como ausente", () => {
			// Sin esto, un `VITE_API_URL=` en blanco se convertiría en un error de
			// URL que dice "inválida" sobre un valor que el dev ni escribió.
			for (const blank of ["", "   "]) {
				const result = resolveApiUrl(blank);
				expect(result.url).toBe(DEFAULT_API_URL);
				expect(result.usedDefault).toBe(true);
			}
		});
	});

	describe("valor inválido", () => {
		test("lanza y nombra la variable, el valor y el motivo", () => {
			// El mensaje es el producto de este fix: es lo único que el operador
			// va a leer, porque el arranque muere acá. Un error genérico
			// devolvería el panel al 500 opaco que esto viene a eliminar.
			expect(() => resolveApiUrl("not-a-url")).toThrow(
				/VITE_API_URL inválida.*"not-a-url"/s,
			);
			expect(() => resolveApiUrl("not-a-url")).toThrow(
				/http:\/\/localhost:4001\/api\/v1/,
			);
		});

		test("rechaza un esquema que no sea http(s)", () => {
			// `z.url()` acepta `file://` y compañía: son URL válidas pero
			// inútiles contra una API REST, y colgarse acá es un mensaje mucho
			// mejor que un 500 por ruta.
			expect(() => resolveApiUrl("file:///etc/passwd")).toThrow(
				/http:\/\/ o https:\/\//,
			);
		});

		test("el default NO se anuncia cuando el valor es válido", () => {
			// Distingue "arrancó porque alguien lo configuró" de "arrancó por
			// defecto": es lo que permite que el default sea un aviso y no una
			// sorpresa en producción.
			const result = resolveApiUrl("https://api.role.test/api/v1");
			expect(result.url).toBe("https://api.role.test/api/v1");
			expect(result.usedDefault).toBe(false);
		});
	});
});
