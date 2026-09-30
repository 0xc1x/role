/**
 * ─── Why this file exists ───────────────────────────────────────────────────
 *
 * The bug it guards is a destination nobody chose.
 *
 * `src/lib/api.ts` used to resolve `env.VITE_API_URL ?? "http://localhost:4001/
 * api/v1"`. That default is a lie with a working fallback attached: the landing
 * is an SSR app, its loaders run in the server's own Node process, and they
 * swallow their own failures. So with the variable missing, every render asked
 * an API that was not there, every loader caught the error, and the page served
 * a confident 200 with the hero on "—" and fallback contact addresses. Nothing
 * was broken loudly, because the failure had a default to hide in.
 *
 * The suite in `e2e/production-isolation.spec.ts` closes the other side (the
 * dev server is pinned to a loopback stub, and the fixture aborts anything
 * aimed at the live backend). This file closes THIS side: the app's own
 * resolution must not be able to invent a target on its own.
 */
import { describe, expect, mock, test } from "bun:test";

import { API_URL_REQUIRED_MESSAGE, apiUrlStartupError } from "../api-url";

describe("apiUrlStartupError", () => {
	test("una URL presente no es un error de arranque", () => {
		// El caso que tiene que seguir funcionando: e2e, dev y producción
		// configurada pasan por acá y NO deben romperse.
		expect(apiUrlStartupError("http://127.0.0.1:3999/api/v1")).toBeNull();
		expect(apiUrlStartupError("https://api.role.app/api/v1")).toBeNull();
		expect(apiUrlStartupError("http://localhost:4001/api/v1")).toBeNull();
	});

	test("una URL ausente es un error de arranque, no un default", () => {
		// ESTE es el defecto. El default viejo (`?? "http://localhost:4001/api/v1"`)
		// hacía que esto fuera `null` y que la app siguiera pegándole a un
		// destino sin que nadie lo hubiera elegido.
		const error = apiUrlStartupError(undefined);
		expect(error).toBeInstanceOf(Error);
		expect(error?.message).toBe(API_URL_REQUIRED_MESSAGE);
	});

	test("una URL presente pero vacía también es un error", () => {
		// El caso que un `if (!raw)` ingenuo deja pasar, y que un `.env` con la
		// variable definida y sin valor (`VITE_API_URL=`) produce de verdad.
		expect(apiUrlStartupError("")).toBeInstanceOf(Error);
	});

	test("una URL mal formada se rechaza en el arranque", () => {
		// Una URL inválida es peor que una ausente: con la ausente el 404 es
		// obvio, con `role-0hjz.onrender.com/api/v1` (sin esquema) el fetch
		// falla de una forma que no señala la causa.
		for (const bad of [
			"role-0hjz.onrender.com/api/v1",
			"/api/v1",
			"not a url",
			"https://",
		]) {
			expect(apiUrlStartupError(bad), bad).toBeInstanceOf(Error);
		}
	});

	test("el mensaje dice qué hacer, no solo qué faltó", () => {
		// Un error de arranque sin siguiente paso se corrige adivinando.
		expect(API_URL_REQUIRED_MESSAGE).toContain("VITE_API_URL");
		expect(API_URL_REQUIRED_MESSAGE).toContain(".env.example");
	});
});

describe("el cliente HTTP no inventa destinos", () => {
	// `api.ts` lee `env` en el scope del módulo, así que el `.env` local decide
	// qué hay en `import.meta.env` y una aserción que dependiera de eso sería
	// verde en la laptop de quien tiene `.env` y roja en CI, que no lo tiene.
	// Por eso `../env` se sustituye: los dos casos se fijan, no se heredan.

	async function apiUrlWith(env: { VITE_API_URL?: string }): Promise<string> {
		mock.module("../env", () => ({ env }));
		const mod = await import(`../api?mock=${Math.random()}`);
		return mod.apiUrl();
	}

	test("sin la variable, apiUrl() NO devuelve el localhost por default", async () => {
		// Esta es la línea que falla contra el código viejo: ahí
		// `env.VITE_API_URL ?? "http://localhost:4001/api/v1"` devolvía el
		// localhost con la variable ausente, que es justo lo que se eliminó.
		const url = await apiUrlWith({});
		expect(url).not.toBe("http://localhost:4001/api/v1");
		expect(url).toBe("");
	});

	test("con la variable, apiUrl() devuelve exactamente el destino elegido", async () => {
		expect(
			await apiUrlWith({ VITE_API_URL: "http://127.0.0.1:3999/api/v1" }),
		).toBe("http://127.0.0.1:3999/api/v1");
		expect(
			await apiUrlWith({ VITE_API_URL: "https://api.role.app/api/v1" }),
		).toBe("https://api.role.app/api/v1");
	});
});
