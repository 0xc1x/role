import { describe, expect, test } from "bun:test";
import { apiPost, apiUrl } from "../api";

describe("apiUrl", () => {
	test("devuelve la base configurada", () => {
		expect(apiUrl()).toContain("http");
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
