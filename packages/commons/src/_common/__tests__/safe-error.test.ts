import { describe, expect, it } from "bun:test";
import { safeErrorFields, safeErrorSummary } from "../utils/safe-error";

describe("safeErrorFields", () => {
	it("nunca filtra el mensaje del error", () => {
		// El motivo de la redacción: el mensaje crudo de un proveedor externo
		// puede traer la API key o el email del destinatario.
		const error = Object.assign(new Error("API key re_123 rejected"), {
			code: "E42",
		});

		const fields = safeErrorFields(error);

		expect(fields).toEqual({ errorType: "Error", errorCode: "E42" });
		expect(JSON.stringify(fields)).not.toContain("re_123");
	});

	it("descarta un `code` fuera del patrón seguro", () => {
		const error = Object.assign(new Error("boom"), {
			code: "E42: contacto juan@correo.com rechazado",
		});

		expect(safeErrorFields(error)).toEqual({ errorType: "Error" });
		expect(safeErrorSummary(error)).toBe("Error");
	});

	it("no lanza con un throw que no es objeto", () => {
		expect(safeErrorFields("texto plano")).toEqual({
			errorType: "string",
		});
		expect(safeErrorFields(undefined)).toEqual({ errorType: "undefined" });
		expect(safeErrorFields(null)).toEqual({ errorType: "object" });
		expect(safeErrorSummary(404)).toBe("number");
	});

	it("cae en UnknownError cuando el nombre no es acotado", () => {
		const error = new Error("boom");
		error.name = "Error con un nombre que no cabe en el patrón";

		expect(safeErrorFields(error)).toEqual({ errorType: "UnknownError" });
	});
});

describe("safeErrorSummary", () => {
	it("une tipo y código", () => {
		const error = Object.assign(new TypeError("boom"), { code: "E42" });

		expect(safeErrorSummary(error)).toBe("TypeError:E42");
	});

	it("devuelve solo el tipo cuando no hay código", () => {
		// `NotFoundException` es la forma que toma la huella en la API.
		const error = new Error("no encontrado");
		error.name = "NotFoundException";

		expect(safeErrorSummary(error)).toBe("NotFoundException");
	});
});
