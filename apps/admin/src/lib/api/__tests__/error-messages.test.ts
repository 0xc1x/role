import { describe, expect, test } from "bun:test";
import {
	translateApiMessage,
	translateValidationMessage,
} from "../error-messages";

/**
 * A12: la API mezcla castellano con los defaults de Nest en inglés. La traducción
 * vive en la capa de error para que ningún call site tenga que saber el idioma
 * del backend.
 */
describe("translateApiMessage", () => {
	test("traduce los mensajes por defecto de Nest", () => {
		expect(translateApiMessage("Internal server error", 500)).toBe(
			"Error interno del servidor",
		);
		expect(translateApiMessage("Bad Request", 400)).toBe(
			"Solicitud incorrecta",
		);
		expect(translateApiMessage("Forbidden", 403)).toBe(
			"Sin permisos para esta operación",
		);
		expect(translateApiMessage("Not Found", 404)).toBe("Recurso no encontrado");
	});

	test("traduce el mensaje del pipe de validación de zod", () => {
		expect(translateApiMessage("Validation failed", 400)).toBe(
			"La validación falló",
		);
	});

	test("tolera la variación de mayúsculas de Nest", () => {
		expect(translateApiMessage("bad request", 400)).toBe(
			"Solicitud incorrecta",
		);
	});

	test("traduce mensajes de servicio con identificador embebido", () => {
		expect(
			translateApiMessage(
				"Business 6f1b0f0e-0000-0000-0000-000000000000 not found",
			),
		).toBe("Business 6f1b0f0e-0000-0000-0000-000000000000 no encontrado");
	});

	test("el fallback sin JSON conserva el status", () => {
		expect(translateApiMessage("Request failed with status 502", 502)).toBe(
			"La solicitud falló con el estado 502",
		);
	});

	// Decisión de diseño: un mensaje desconocido se muestra tal cual. Reemplazarlo
	// por un "Error desconocido" destruiría el diagnóstico del servidor.
	test("un mensaje desconocido se devuelve sin tocar", () => {
		expect(translateApiMessage("Payout already paid", 409)).toBe(
			"Payout already paid",
		);
	});

	test("un mensaje que la API ya escribió en español no se toca", () => {
		expect(translateApiMessage("La campaña requiere una plantilla", 400)).toBe(
			"La campaña requiere una plantilla",
		);
		expect(translateApiMessage("Campaña no encontrada", 404)).toBe(
			"Campaña no encontrada",
		);
	});
});

describe("translateValidationMessage", () => {
	test("traduce los mensajes de zod v4 con tipo y límite", () => {
		expect(
			translateValidationMessage(
				"Too small: expected string to have >=1 characters",
			),
		).toBe("Debe tener al menos 1 caracteres");
		expect(translateValidationMessage("Invalid email address")).toBe(
			"Correo electrónico inválido",
		);
		expect(
			translateValidationMessage(
				"Invalid input: expected string, received number",
			),
		).toBe("Se esperaba string y se recibió number");
	});

	test("lo que no conoce se devuelve tal cual", () => {
		// Los mensajes propios de `commons` ya vienen en español.
		expect(
			translateValidationMessage(
				"Se requiere al menos un campo para actualizar",
			),
		).toBe("Se requiere al menos un campo para actualizar");
		expect(translateValidationMessage("Zod: cosa rara")).toBe("Zod: cosa rara");
	});
});
