/**
 * Aviso único de error de mutación.
 *
 * POR QUÉ ESTE HELPER EXISTE: la API devuelve `requestId` en cada error
 * (`AllExceptionsFilter`) y es lo único que permite encontrar la petición en los
 * logs del servidor. Con 4 copias locales de `notifyMutationError` y ~10
 * `toast.error(err.message)` sueltos, el `requestId` solo habría llegado a los
 * call sites que alguien se acordara de reescribir a mano. Centralizar el aviso
 * es lo que hace que el identificador aparezca en todas partes.
 *
 * El `requestId` NO es un log: se muestra al operador en un toast para que lo
 * comunique a soporte, y soporte lo cruza con el log del servidor. El mensaje
 * crudo del servidor tampoco se envía a ningún sink (el admin no tiene ninguno y
 * `docs/operations.md` prohíbe añadirlo).
 */

import { toast } from "sonner";
import { ApiClientError } from "./errors";

/** Fallback cuando el throw no es un `Error` (React Query acepta `unknown`). */
const UNEXPECTED_ERROR = "Error inesperado";

/**
 * `<mensaje> · <requestId>` cuando la API dio correlación; solo el mensaje si
 * no la dio (fallo local, 401 sintético o body no-JSON).
 */
export function formatApiError(error: unknown): string {
	const message = error instanceof Error ? error.message : UNEXPECTED_ERROR;
	const requestId =
		error instanceof ApiClientError ? error.requestId : undefined;
	return requestId ? `${message} · ${requestId}` : message;
}

/**
 * Error de mutación → toast. Pura y sin closure: se pasa por referencia a
 * `onError` y vive a nivel de módulo.
 */
export function notifyMutationError(error: unknown): void {
	toast.error(formatApiError(error));
}
