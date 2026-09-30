/**
 * Traducción de mensajes de la API al español del panel.
 *
 * La API mezcla castellano y los valores por defecto de Nest (inglés). Sin esta
 * capa, un back office en español muestra `Internal server error` al operador.
 * Vive AQUÍ, no en cada call site: los mensajes se corrigen una vez y todo
 * consumidor (toasts, drawers, estados vacíos) los recibe ya traducidos.
 *
 * Regla de diseño: lo que no se reconoce se devuelve tal cual. Prefijar o
 * reemplazar un mensaje desconocido por un genérico destruye información real
 * (un "Payout already paid" del servidor vale más que un "Error desconocido"),
 * y un mensaje que la API ya escribió en español no debe tocarse.
 */

/** Mensajes exactos conocidos de Nest y del propio backend, en inglés. */
const API_MESSAGES: Record<string, string> = {
	// Defaults de Nest por status code.
	"bad request": "Solicitud incorrecta",
	unauthorized: "No autenticado",
	forbidden: "Sin permisos para esta operación",
	"not found": "Recurso no encontrado",
	conflict: "Conflicto con el estado actual",
	"unprocessable entity": "No se pudo procesar la solicitud",
	"internal server error": "Error interno del servidor",
	"service unavailable": "Servicio no disponible",
	// ZodValidationPipe (apps/api).
	"validation failed": "La validación falló",
	// Defaults del propio cliente.
	"unknown error": "Error desconocido",
	"session expired": "Tu sesión expiró",
};

/** Mensajes de servicio con identificador embebido: "Business <id> not found". */
const SERVICE_RULES: Array<[RegExp, string]> = [
	[/^(.*) not found$/i, "$1 no encontrado"],
	[/^(.*) already exists$/i, "$1 ya existe"],
];

/** Respuestas cuyo texto depende del status (fallback de `throwFromResponse`). */
const STATUS_RULES: Array<[RegExp, (status: string) => string]> = [
	[
		/^request failed with status (\d+)$/i,
		(status) => `La solicitud falló con el estado ${status}`,
	],
];

/**
 * Mensajes de zod v4, que llegan en `details[]` y se asocian a un campo
 * concreto. Se traducen aparte del mensaje de error porque son composicionales
 * (`Too small: expected string to have >=1 characters` incluye tipo y límite) y
 * solo tienen sentido junto a su campo. Los mensajes propios de `commons` ya
 * vienen en español y no aparecen aquí.
 */
const VALIDATION_RULES: Array<[RegExp, string]> = [
	[
		/^too small: expected .+ to have >=\s*(\d+)\s*characters?$/i,
		"Debe tener al menos $1 caracteres",
	],
	[
		/^too big: expected .+ to have <=\s*(\d+)\s*characters?$/i,
		"No puede superar los $1 caracteres",
	],
	[/^invalid email address$/i, "Correo electrónico inválido"],
	[/^invalid uuid$/i, "Identificador inválido"],
	[/^invalid url$/i, "URL inválida"],
	[
		/^invalid input: expected (.+?), received (.+)$/i,
		"Se esperaba $1 y se recibió $2",
	],
	[/^unrecognized keys: (.+)$/i, "Campos desconocidos: $1"],
];

/**
 * Traduce un mensaje de la API. Devuelve el original si no hay traducción
 * conocida: el panel prefiere un mensaje en inglés a perder el diagnóstico.
 */
export function translateApiMessage(message: string, status?: number): string {
	const trimmed = message.trim();
	if (!trimmed) return message;

	// La clave es minúscula porque Nest varyó las mayúsculas entre versiones
	// ("Bad Request" / "bad request") y no vale la pena duplicar entradas.
	const exact = API_MESSAGES[trimmed.toLowerCase()];
	if (exact) return exact;

	for (const [pattern, build] of STATUS_RULES) {
		const match = trimmed.match(pattern);
		if (match) return build(match[1] ?? String(status ?? "?"));
	}

	for (const [pattern, replacement] of SERVICE_RULES) {
		if (pattern.test(trimmed)) {
			return trimmed.replace(pattern, replacement);
		}
	}

	return message;
}

/** Traduce un mensaje de validación de zod v4 a español. */
export function translateValidationMessage(message: string): string {
	const trimmed = message.trim();
	for (const [pattern, replacement] of VALIDATION_RULES) {
		if (pattern.test(trimmed)) {
			return trimmed.replace(pattern, replacement);
		}
	}
	return message;
}
