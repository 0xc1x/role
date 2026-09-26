import { describe, expect, it } from "bun:test";
import { ApiClientError, throwFromResponse } from "../errors";
import { formatApiError } from "../notify";

/**
 * Solo se prueba el formateador, no `notifyMutationError`: este último es una
 * delegación de una línea a `toast.error`, y mockear el módulo `sonner` en
 * bun:test es global y rompería `root-toaster.test.tsx` (monta el `<Toaster/>`
 * real y comprueba que los toasts se pintan).
 */
describe("formatApiError", () => {
	it("añade el requestId para que soporte pueda correlacionar", () => {
		const err = new ApiClientError({
			status: 500,
			message: "Error interno del servidor",
			requestId: "b1f0c2d4-8a7e",
		});

		expect(formatApiError(err)).toBe(
			"Error interno del servidor · b1f0c2d4-8a7e",
		);
	});

	it("deja el mensaje intacto cuando la API no dio requestId", () => {
		const err = new ApiClientError({ status: 404, message: "No encontrado" });

		expect(formatApiError(err)).toBe("No encontrado");
	});

	it("usa el fallback para un throw que no es Error", () => {
		expect(formatApiError("texto plano")).toBe("Error inesperado");
	});

	it("no inventa un requestId en errores que no son de la API", () => {
		const err = Object.assign(new Error("fallo local"), {
			requestId: "inventado",
		});

		expect(formatApiError(err)).toBe("fallo local");
	});

	it("respeta el fallback propio del call site para un throw que no es Error", () => {
		// El copy bespoke de un call site no puede perderse al adopter el
		// notifier: solo aplica cuando el throw no trae mensaje.
		expect(formatApiError({ nope: true }, "Payload inválido")).toBe(
			"Payload inválido",
		);
	});

	it("el fallback propio no pisa el mensaje real de la API", () => {
		const err = new ApiClientError({
			status: 400,
			message: "Validation failed",
			requestId: "aa11bb22",
		});

		expect(formatApiError(err, "Payload inválido")).toBe(
			"Validation failed · aa11bb22",
		);
	});
});

describe("requestId en el error de la API", () => {
	function mockResponse(status: number, body: unknown): Response {
		return {
			status,
			json: () => Promise.resolve(body),
			ok: status >= 200 && status < 300,
		} as Response;
	}

	it("se extrae del body de error", async () => {
		const res = mockResponse(500, {
			statusCode: 500,
			message: "Error interno del servidor",
			error: "Internal Server Error",
			path: "/api/v1/categories",
			requestId: "3f7a1b9c-22de",
		});

		await expect(throwFromResponse(res)).rejects.toMatchObject({
			status: 500,
			requestId: "3f7a1b9c-22de",
		});
	});

	it("se descarta si no cumple el patrón acotado", async () => {
		const res = mockResponse(500, {
			statusCode: 500,
			message: "Error interno del servidor",
			requestId: "correlación con texto que el operador no debería leer",
		});

		await expect(throwFromResponse(res)).rejects.toMatchObject({
			status: 500,
			requestId: undefined,
		});
	});

	it("no aparece cuando el body no es JSON", async () => {
		const res = {
			status: 502,
			json: () => Promise.reject(new Error("Invalid JSON")),
		} as Response;

		await expect(throwFromResponse(res)).rejects.toMatchObject({
			status: 502,
			requestId: undefined,
		});
	});
});
