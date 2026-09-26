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

	// El caso que aportó la copia de la API al fusionarse aquí: un error de
	// driver de Postgres llega con `name` ya acotado y un `code` numérico, y ese
	// par es lo que hace falta para triage (`23505` = unique violation). Sin el
	// nombre, el log solo decía `"Error"` para cualquier caída de la base de datos.
	it("conserva el nombre acotado de un driver con su código", () => {
		const error = Object.assign(new Error("duplicate key"), {
			name: "PostgrestError",
			code: "23505",
		});

		expect(safeErrorFields(error)).toEqual({
			errorType: "PostgrestError",
			errorCode: "23505",
		});
		expect(safeErrorSummary(error)).toBe("PostgrestError:23505");
	});

	it("no filtra el contenido de un objeto que no es Error", () => {
		// Un `throw { token }` es un caso real: el objeto entero es el error. La
		// huella debe quedarse en su `typeof`, nunca serializar sus campos.
		const fields = safeErrorFields({ token: "do-not-log" });

		expect(fields).toEqual({ errorType: "object" });
		expect(JSON.stringify(fields)).not.toContain("do-not-log");
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
