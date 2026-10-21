import { AppError, Errors, type ErrorKind } from "@/src/core/error/app-error";

/**
 * Traducción de las respuestas del API a la taxonomía del app.
 *
 * POR QUÉ EXISTE: el móvil no habla con la API (ADR-0002) salvo para
 * ADMINISTRAR QUIÉN OPERA (ADR-0013 §A.1). Ese camino necesita reglas de
 * negocio que viven en el servidor —el tope del plan, el alcance del
 * gerente— y que desde el cliente no se pueden replicar sin mentir. Esas
 * reglas llegan como un sobre (`statusCode`, `message`, `requestId`) y este
 * módulo lo convierte en un `AppError`, que es lo que la UI sabe pintar.
 */

/** El sobre del API (`AllExceptionsFilter`). Del resto no se lee nada. */
type ApiEnvelope = {
	message?: unknown;
	path?: unknown;
	requestId?: unknown;
};

/**
 * Estado HTTP → categoría de la taxonomía.
 *
 * El 422 es el que dice "el plan no admite otro acceso": una regla de
 * producto, no un error de forma, y por eso tiene categoría propia. Los 5xx
 * y cualquier estado sin categoría son `unknown`: el servidor falló y el
 * usuario no tiene nada que corregir.
 */
const KIND_BY_STATUS: Partial<Record<number, ErrorKind>> = {
	400: "validation",
	401: "unauthorized",
	403: "forbidden",
	404: "not_found",
	409: "conflict",
	422: "business_rule",
};

/** Texto de último recurso: el que la taxonomía usa para lo que no sabe. */
const GENERIC_FALLBACK = Errors.unknown().message;

/**
 * Las categorías cuyo texto del API ES la copia del producto.
 *
 * En un 422, un 400 o un 409 el servidor escribe la prosa para ESTA persona
 * ("Tu plan no admite otro acceso", "Elige una sucursal") y esa prosa es la
 * promesa que el plan hace: se muestra tal cual.
 *
 * En un 401, un 403 o un 5xx el servidor escribe texto TÉCNICO —el guard de
 * auth responde 'Missing access token'— y eso no puede ser lo que ve quien
 * usa la app: ahí manda la copia curada de la taxonomía ("Debes iniciar
 * sesión para continuar."). El texto crudo nunca se pierde: vive en
 * `context.serverMessage` para el diagnóstico.
 */
const ADOPTS_SERVER_COPY: ReadonlySet<ErrorKind> = new Set([
	"business_rule",
	"validation",
	"conflict",
	"not_found",
]);

/**
 * Las fábricas de `Errors` sólo aceptan el mensaje: la categoría y el texto
 * salen de ahí, y el código y el contexto se añaden después con el
 * constructor de `AppError` (el mismo truco de `src/core/error/mapper.ts`).
 */
const ERRORS_BY_KIND: Record<ErrorKind, (message?: string) => AppError> = {
	network: (message) => Errors.network(message),
	unauthorized: (message) => Errors.unauthorized(message),
	forbidden: (message) => Errors.forbidden(message),
	not_found: (message) => Errors.notFound(message),
	validation: (message) => Errors.validation(message),
	conflict: (message) => Errors.conflict(message),
	// `Errors.businessRule` exige el mensaje (no tiene texto por defecto): el
	// 422 del API siempre trae la prosa en español.
	business_rule: (message) => Errors.businessRule(message ?? GENERIC_FALLBACK),
	unknown: (message) => Errors.unknown(message),
};

function kindForStatus(status: number): ErrorKind {
	if (status >= 500) return "unknown";
	return KIND_BY_STATUS[status] ?? "unknown";
}

/**
 * Añade el código y el contexto de observabilidad a un error de la
 * taxonomía, sin tocar su categoría ni su texto.
 */
function withContext(
	error: AppError,
	code: string | undefined,
	context: Record<string, unknown>,
): AppError {
	return new AppError(error.kind, error.message, code, {
		...error.context,
		...context,
	});
}

async function readEnvelope(response: Response): Promise<ApiEnvelope | null> {
	try {
		const body = await response.json();
		if (body && typeof body === "object") return body as ApiEnvelope;
		return null;
	} catch {
		// Un cuerpo que no es JSON (un proxy, un 502 de otra capa) no es un
		// sobre, pero el estado y el statusText siguen siendo utilizables.
		return null;
	}
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

/** El `message` del sobre: un texto, o la lista que Nest manda al validar. */
function readMessage(envelope: ApiEnvelope | null): string | undefined {
	const raw = envelope?.message;
	if (typeof raw === "string") return raw.trim() ? raw : undefined;
	if (Array.isArray(raw)) {
		const parts = raw.filter(
			(part): part is string => typeof part === "string" && part.trim() !== "",
		);
		return parts.length ? parts.join(", ") : undefined;
	}
	return undefined;
}

/** Sin sobre y sin statusText queda el texto que la taxonomía usa. */
function fallbackMessage(response: Response, kind: ErrorKind): string {
	const statusText = response.statusText?.trim();
	if (statusText) return statusText;
	return ERRORS_BY_KIND[kind]().message;
}

/**
 * El texto crudo que el servidor dijo, como venga: el `message` del sobre, o
 * el `statusText` cuando el cuerpo no era JSON. Es diagnóstico, nunca la
 * copia que ve la persona.
 */
function readServerText(
	envelope: ApiEnvelope | null,
	response: Response,
): string | undefined {
	const message = readMessage(envelope);
	if (message) return message;
	// Un sobre sin `message` no trae texto crudo; un cuerpo que no era JSON
	// sólo deja el `statusText`.
	if (envelope) return undefined;
	return response.statusText?.trim() || undefined;
}

/**
 * Convierte una respuesta de error del API en el `AppError` que la UI sabe
 * pintar, y no devuelve nunca: el llamador la usa como `return`.
 *
 * El `message` es la copia del producto: la prosa del API cuando esa prosa
 * ES la copia del producto (`ADOPTS_SERVER_COPY`), y la de la taxonomía
 * cuando el servidor escribió texto técnico. El texto crudo del servidor
 * viaja siempre en `context.serverMessage`, para el diagnóstico.
 *
 * El `code` es el estado HTTP (`String(status)`), que es lo accionable del
 * diagnóstico; el `context` lleva el path y el `requestId` del servidor para
 * correlacionar con el log del API.
 */
export async function fromApiResponse(
	response: Response,
	path: string,
): Promise<never> {
	const envelope = await readEnvelope(response);
	const kind = kindForStatus(response.status);
	const serverMessage = readServerText(envelope, response);
	const message = ADOPTS_SERVER_COPY.has(kind)
		? (serverMessage ?? fallbackMessage(response, kind))
		: ERRORS_BY_KIND[kind]().message;

	throw withContext(ERRORS_BY_KIND[kind](message), String(response.status), {
		path: readString(envelope?.path) ?? path,
		requestId: readString(envelope?.requestId),
		...(serverMessage ? { serverMessage } : {}),
	});
}

/**
 * No hubo respuesta: la petición no llegó al servidor (sin red, DNS, TLS).
 * No es un error del API, y por eso no lleva código de estado.
 */
export function fromNetworkFailure(path: string, cause?: unknown): AppError {
	const causeText =
		cause instanceof Error
			? cause.message
			: typeof cause === "string"
				? cause
				: undefined;

	return withContext(Errors.network(), undefined, {
		path,
		...(causeText ? { cause: causeText } : {}),
	});
}

/** El servidor respondió 2xx con un cuerpo que no es JSON. */
export function fromInvalidBody(path: string): AppError {
	return withContext(Errors.unknown(), undefined, { path });
}
