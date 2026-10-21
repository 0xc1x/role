import { describe, expect, test } from "bun:test";

import {
	fromApiResponse,
	fromInvalidBody,
	fromNetworkFailure,
} from "@/src/core/api/errors";
import { AppError, Errors, type ErrorKind } from "@/src/core/error/app-error";

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

/**
 * Las categorías cuya prosa del API ES la copia del producto: el servidor
 * escribió la frase para esta persona y se muestra tal cual.
 */
const ADOPTS_SERVER_COPY: ErrorKind[] = [
	"validation",
	"not_found",
	"conflict",
	"business_rule",
];

/**
 * Las que muestran la copia curada de la taxonomía: el texto del servidor
 * es técnico ('Missing access token') y no puede ser lo que ve la persona.
 */
const CURATED_COPY: ErrorKind[] = ["unauthorized", "forbidden", "unknown"];

/**
 * Una ruta que NO es de la superficie del equipo.
 *
 * El 403 del equipo es la excepción (la prosa del servidor ES la del
 * producto), así que la copia curada se afirma sobre otra ruta: la del 403
 * genérico, el de los guards de auth y de roles.
 */
const GENERIC_PATH = "/businesses/x/products";

/** El texto que el servidor escribió en el sobre de todos los casos. */
const SERVER_MESSAGE = "El plan no admite otro acceso";

/** LaTaxonomía, para comparar contra su propia copia. */
const TAXONOMY_COPY: Record<ErrorKind, () => AppError> = {
	network: () => Errors.network(),
	unauthorized: () => Errors.unauthorized(),
	forbidden: () => Errors.forbidden(),
	not_found: () => Errors.notFound(),
	validation: () => Errors.validation(),
	conflict: () => Errors.conflict(),
	business_rule: () => Errors.businessRule("x"),
	unknown: () => Errors.unknown(),
};

describe("fromApiResponse", () => {
	test("cada estado del API cae en su categoría, con el estado como código", async () => {
		for (const [status, kind] of STATUS_TABLE) {
			const response = apiResponse(status, {
				statusCode: status,
				message: SERVER_MESSAGE,
				error: "Unprocessable Entity",
				path: "/api/v1/businesses/x/staff",
				requestId: "req-000042",
			});

			await expect(
				fromApiResponse(response, "/businesses/x/staff"),
			).rejects.toMatchObject({
				kind,
				code: String(status),
			});
		}
	});

	test("la prosa del API se muestra cuando ES la copia del producto", async () => {
		for (const [status, kind] of STATUS_TABLE) {
			if (!ADOPTS_SERVER_COPY.includes(kind)) continue;

			const response = apiResponse(status, {
				statusCode: status,
				message: SERVER_MESSAGE,
			});

			await expect(
				fromApiResponse(response, "/businesses/x/staff"),
			).rejects.toMatchObject({
				kind,
				code: String(status),
				message: SERVER_MESSAGE,
			});
		}
	});

	test("un 401, un 403 o un 5xx no muestran el texto técnico del servidor", async () => {
		for (const [status, kind] of STATUS_TABLE) {
			if (!CURATED_COPY.includes(kind)) continue;

			// El guard de auth del API responde en inglés: 'Missing access
			// token'. Eso es diagnóstico, no la copia que ve la persona.
			const response = apiResponse(status, {
				statusCode: status,
				message: "Missing access token",
			});

			await expect(
				fromApiResponse(response, GENERIC_PATH),
			).rejects.toMatchObject({
				kind,
				code: String(status),
				message: TAXONOMY_COPY[kind]().message,
			});
		}
	});

	// ─── El 403 del EQUIPO: la prosa del API ES la del producto ────────────────

	/**
	 * La prosa del servidor en un 403 del equipo.
	 *
	 * Es el motivo por el que la persona tiene que actuar: «Tu sesión venció.
	 * Entra otra vez para seguir administrando el equipo.» Lo que el plan
	 * promete (T12) es que esa prosa se muestre, y hoy el 403 la traducía a
	 * «No tienes permiso para realizar esta acción.» —un permiso que el
	 * problema no era de permisos.
	 */
	const STAFF_PROSE =
		"Tu sesión venció. Entra otra vez para seguir administrando el equipo.";

	for (const path of [
		"/businesses/x/staff",
		"/businesses/x/staff/revoke-all",
		"/businesses/x/ownership/transfer",
		"/staff/session",
	]) {
		test(`un 403 en ${path} muestra la prosa del API`, async () => {
			const response = apiResponse(403, {
				statusCode: 403,
				message: STAFF_PROSE,
			});

			await expect(fromApiResponse(response, path)).rejects.toMatchObject({
				kind: "forbidden",
				code: "403",
				message: STAFF_PROSE,
				// Y el texto crudo sigue en el contexto, para el diagnóstico.
				context: { serverMessage: STAFF_PROSE },
			});
		});
	}

	test("un 403 fuera del equipo sigue curado: ése es texto técnico", async () => {
		const response = apiResponse(403, {
			statusCode: 403,
			message: "Missing access token",
		});

		await expect(fromApiResponse(response, GENERIC_PATH)).rejects.toMatchObject(
			{
				kind: "forbidden",
				code: "403",
				message: Errors.forbidden().message,
				context: { serverMessage: "Missing access token" },
			},
		);
	});

	test("un 403 del equipo sin prosa en el sobre no enseña el statusText", async () => {
		// «Forbidden» es texto técnico en inglés: si el sobre no trae `message`,
		// se queda la copia curada de la taxonomía.
		const response = apiResponse(403, { statusCode: 403 }, "Forbidden");

		await expect(
			fromApiResponse(response, "/businesses/x/staff"),
		).rejects.toMatchObject({
			kind: "forbidden",
			message: Errors.forbidden().message,
		});
	});

	test("el texto crudo del servidor viaja en el contexto, sea cual sea la categoría", async () => {
		for (const [status, kind] of STATUS_TABLE) {
			const response = apiResponse(status, {
				statusCode: status,
				message: SERVER_MESSAGE,
			});

			await expect(
				fromApiResponse(response, "/businesses/x/staff"),
			).rejects.toMatchObject({
				kind,
				context: { serverMessage: SERVER_MESSAGE },
			});
		}
	});

	test("el error es de la taxonomía del app, no una excepción suelta", async () => {
		const response = apiResponse(422, { message: "Tope del plan" });

		const error = await fromApiResponse(response, "/businesses/x/staff").catch(
			(caught: unknown) => caught,
		);

		expect(error).toBeInstanceOf(AppError);
	});

	test("un cuerpo que no es JSON usa el statusText", async () => {
		// El 404 es de las categorías cuya copia ES la del producto: el
		// statusText es el único texto que hay.
		const response = brokenResponse(404, "Not Found");

		await expect(
			fromApiResponse(response, "/businesses/x/staff"),
		).rejects.toMatchObject({
			kind: "not_found",
			code: "404",
			message: "Not Found",
		});
	});

	test("un 5xx con un cuerpo que no es JSON no muestra el statusText", async () => {
		const response = brokenResponse(502, "Bad Gateway");

		await expect(
			fromApiResponse(response, "/businesses/x/staff"),
		).rejects.toMatchObject({
			kind: "unknown",
			code: "502",
			message: TAXONOMY_COPY.unknown().message,
			context: { serverMessage: "Bad Gateway" },
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
