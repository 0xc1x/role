import {
	translateApiMessage,
	translateValidationMessage,
} from "./error-messages";

/**
 * `requestId` es lo único que correlaciona el toast del operador con el log del
 * servidor: la API lo devuelve en cada error (`AllExceptionsFilter`). Se acota
 * con el mismo patrón que aplica el filtro para que un body inesperado no sirva
 * para pintar texto arbitrario en el toast.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function readRequestId(value: unknown): string | undefined {
	return typeof value === "string" && REQUEST_ID_PATTERN.test(value)
		? value
		: undefined;
}

export class ApiClientError extends Error {
	status: number;
	error?: string;
	details?: unknown;
	path?: string;
	/** Correlación con el log del servidor; se muestra al operador. */
	requestId?: string;

	constructor(opts: {
		status: number;
		message: string | string[];
		error?: string;
		details?: unknown;
		path?: string;
		requestId?: string;
	}) {
		const msg = Array.isArray(opts.message)
			? opts.message.join(", ")
			: opts.message;
		super(msg);
		this.name = "ApiClientError";
		this.status = opts.status;
		this.error = opts.error;
		this.details = opts.details;
		this.path = opts.path;
		this.requestId = opts.requestId;
	}
}

type ApiDetail = { path?: unknown; message?: unknown };

/**
 * Errores de campo que devuelve la API: `{ details: [{ path, message }] }` de
 * `ZodValidationPipe` (apps/api). Se indexan por el path del contrato para que
 * el form los muestre en el campo que falló, en vez de un único párrafo arriba
 * que obliga a diffear dos cadenas a ojo.
 */
export function getApiFieldErrors(error: unknown): Record<string, string> {
	if (!(error instanceof ApiClientError)) return {};
	const details = error.details;
	if (!Array.isArray(details)) return {};

	const fields: Record<string, string> = {};
	for (const detail of details as ApiDetail[]) {
		const path = typeof detail?.path === "string" ? detail.path : "";
		const message = typeof detail?.message === "string" ? detail.message : "";
		// Sin path no hay campo al que asociarlo: se queda en el mensaje global.
		if (!path || !message) continue;
		fields[path] ??= translateValidationMessage(message);
	}
	return fields;
}

export async function throwFromResponse(response: Response): Promise<never> {
	let body: Record<string, unknown> = {};
	try {
		body = (await response.json()) as Record<string, unknown>;
	} catch {
		throw new ApiClientError({
			status: response.status,
			message: translateApiMessage(
				`Request failed with status ${response.status}`,
				response.status,
			),
		});
	}
	// Un único punto de traducción para toda la API: los call sites reciben el
	// mensaje ya en español sin saber nada del idioma del backend.
	const raw = (body.message as string | string[]) ?? "Unknown error";
	throw new ApiClientError({
		status: response.status,
		message: Array.isArray(raw)
			? raw.map((m) => translateApiMessage(m, response.status))
			: translateApiMessage(raw, response.status),
		error: body.error as string | undefined,
		details: body.details,
		path: body.path as string | undefined,
		requestId: readRequestId(body.requestId),
	});
}
