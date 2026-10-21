import { describe, expect, test } from "bun:test";

import {
	fromApiResponse,
	fromInvalidBody,
	fromNetworkFailure,
} from "@/src/core/api/errors";
import { AppError, type ErrorKind } from "@/src/core/error/app-error";

/**
 * El sobre del API (`AllExceptionsFilter`): `{ statusCode, message, error,
 * path, timestamp, requestId }`.
 */
function apiResponse(status: number, body: unknown, statusText = ""): Response {
	return {
		status,
		ok: status >= 200 && status < 300,
		statusText,
		json: () => Promise.resolve(body),
	} as unknown as Response;
}

/** Un cuerpo que no es JSON: un proxy o una capa delante del API. */
function brokenResponse(status: number, statusText: string): Response {
	return {
		status,
		ok: false,
		statusText,
		json: () => Promise.reject(new SyntaxError("Unexpected token '<'")),
	} as unknown as Response;
}

/**
 * Estado → categoría de la taxonomía.
 *
 * El 422 es el que dice "el plan no admite otro acceso": una regla de
 * producto, no un error de forma, y por eso tiene categoría propia. Los 5xx
 * y cualquier estado sin categoría son `unknown`: el servidor falló y el
 * usuario no tiene nada que corregir.
 */
const STATUS_TABLE: Array<[number, ErrorKind]> = [
	[400, "validation"],
	[401, "unauthorized"],
	[403, "forbidden"],
	[404, "not_found"],
	[409, "conflict"],
	[422, "business_rule"],
	[500, "unknown"],
	[503, "unknown"],
];

describe("fromApiResponse", () => {
	test("cada estado del API cae en su categoría, con el estado como código", async () => {
		for (const [status, kind] of STATUS_TABLE) {
			const response = apiResponse(status, {
				statusCode: status,
				message: "El plan no admite otro acceso",
				error: "Unprocessable Entity",
				path: "/api/v1/businesses/x/staff",
				requestId: "req-000042",
			});

			await expect(
				fromApiResponse(response, "/businesses/x/staff"),
			).rejects.toMatchObject({
				kind,
				code: String(status),
				message: "El plan no admite otro acceso",
			});
		}
	});

	test("el fallo es de la taxonomía del app, no una excepción suelta", async () => {
		const response = apiResponse(422, { message: "Tope del plan" });

		const error = await fromApiResponse(response, "/businesses/x/staff").catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(AppError);
	});

	test("un cuerpo que no es JSON usa el statusText", async () => {
		const response = brokenResponse(502, "Bad Gateway");

		await expect(
			fromApiResponse(response, "/businesses/x/staff"),
		).rejects.toMatchObject({
			kind: "unknown",
			code: "502",
			message: "Bad Gateway",
		});
	});

	test("un sobre sin mensaje usa el statusText", async () => {
		const response = apiResponse(
			404,
			{ statusCode: 404, error: "Not Found" },
			"Not Found",
		);

		await expect(
			fromApiResponse(response, "/businesses/x/staff"),
		).rejects.toMatchObject({
			kind: "not_found",
			code: "404",
			message: "Not Found",
		});
	});

	test("un mensaje en lista (validación del API) se lee como una frase", async () => {
		const response = apiResponse(400, {
			statusCode: 400,
			message: ["El nombre es obligatorio", "Elige una sucursal"],
		});

		await expect(
			fromApiResponse(response, "/businesses/x/staff"),
		).rejects.toMatchObject({
			kind: "validation",
			message: "El nombre es obligatorio, Elige una sucursal",
		});
	});

	test("el path y el requestId viajan en el contexto para correlacionar", async () => {
		const response = apiResponse(422, {
			statusCode: 422,
			message: "Tope del plan",
			path: "/api/v1/businesses/x/staff",
			requestId: "req-000042",
		});

		await expect(
			fromApiResponse(response, "/businesses/x/staff"),
		).rejects.toMatchObject({
			context: {
				path: "/api/v1/businesses/x/staff",
				requestId: "req-000042",
			},
		});
	});

	test("sin path en el sobre se usa el que pidió el cliente", async () => {
		const response = apiResponse(404, {
			statusCode: 404,
			message: "No existe",
		});

		await expect(
			fromApiResponse(response, "/businesses/x/staff"),
		).rejects.toMatchObject({
			context: { path: "/businesses/x/staff" },
		});
	});
});

describe("sin respuesta del servidor", () => {
	test("un fallo de red es `network`, no un error del servidor", () => {
		const error = fromNetworkFailure(
			"/businesses/x/staff",
			new TypeError("fetch failed"),
		);

		expect(error.kind).toBe("network");
		expect(error.code).toBeUndefined();
		expect(error.message).toMatch(/conexión/i);
		expect(error.context?.path).toBe("/businesses/x/staff");
	});

	test("un 2xx con un cuerpo que no es JSON es `unknown`", () => {
		const error = fromInvalidBody("/businesses/x/staff");

		expect(error.kind).toBe("unknown");
		expect(error.context?.path).toBe("/businesses/x/staff");
	});
});
