import { describe, expect, mock, test } from "bun:test";
import { apiPost } from "../api";

/**
 * El destino de la API lo elige `VITE_API_URL`, y ese valor llega desde el
 * `.env` local (o desde el ambiente) porque `api.ts` lee `env` en el scope del
 * módulo.
 *
 * HEREDARLO hacía que esta aserción dependiera del entorno del desarrollador:
 * verde en la laptop de quien tiene `apps/landing/.env`, roja en CI, que no lo
 * tiene. Y una prueba que hereda el destino del `.env` del otro no prueba el
 * destino de nadie. El valor se FIJA acá —el mismo patrón que `env.test.ts`—:
 * se sustituye `../env` y se reimporta `../api` con una query distinta para
 * que el módulo vuelva a evaluarse contra la env fijada.
 */
const BASE = "http://api.test.invalid/api/v1";

describe("apiUrl", () => {
	test("devuelve la base configurada", async () => {
		mock.module("../env", () => ({ env: { VITE_API_URL: BASE } }));
		const { apiUrl } = await import(`../api?base=${Math.random()}`);
		// Exacto, no "contiene http": la base configurada es la que se pidió,
		// con su prefijo incluido, y no un prefijo cualquiera.
		expect(apiUrl()).toBe(BASE);
	});
});

describe("apiPost", () => {
	test("ok con json", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})) as unknown as typeof fetch;
		await expect(apiPost("/x", { a: 1 })).resolves.toEqual({ ok: true });
	});

	test("error con message del backend", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ message: "Mal" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})) as unknown as typeof fetch;
		await expect(apiPost("/x", {})).rejects.toThrow("Mal");
	});

	test("error con details de zod", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ details: [{ message: "Requerido" }] }), {
				status: 422,
				headers: { "Content-Type": "application/json" },
			})) as unknown as typeof fetch;
		await expect(apiPost("/x", {})).rejects.toThrow("Requerido");
	});

	test("error con message en lista usa el primero", async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ message: ["Campo requerido"] }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			})) as unknown as typeof fetch;
		await expect(apiPost("/x", {})).rejects.toThrow("Campo requerido");
	});

	test("error no-json usa texto", async () => {
		globalThis.fetch = (async () =>
			new Response("Fallo interno", {
				status: 500,
				headers: { "Content-Type": "text/plain" },
			})) as unknown as typeof fetch;
		await expect(apiPost("/x", {})).rejects.toThrow("Fallo interno");
	});

	test("ok sin json devuelve undefined", async () => {
		globalThis.fetch = (async () =>
			new Response("", {
				status: 200,
				headers: { "Content-Type": "text/plain" },
			})) as unknown as typeof fetch;
		await expect(apiPost("/x", {})).resolves.toBeUndefined();
	});
});
