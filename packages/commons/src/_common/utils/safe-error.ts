/**
 * Redacción de errores para superficies de cliente (admin, mobile) y para los
 * logs estructurados de la API.
 *
 * POR QUÉ EXISTE: el frontend no tiene capa de redacción. La API redacta lo que
 * loguea y las edge functions de Supabase hacen lo mismo en su copia Deno, pero
 * admin y mobile no tienen equivalente: cualquier logging futuro en un cliente
 * se llevaría la cadena cruda del servidor (PII: emails, ids de cuenta, tokens)
 * a un agregador. Este módulo es el prerrequisito: fija la misma disciplina (solo
 * `errorType` y `errorCode` acotados; nunca mensajes, stacks ni `cause`) ANTES de
 * que ese logging exista, para no tener que auditarlo después.
 *
 * Es ENVIRONMENT-AGNÓSTICO a propósito: sin DOM, sin React, sin `window` ni
 * `process`, porque lo consumen tanto el navegador (admin) como React Native.
 *
 * ÚNICO en el monorepo salvo `supabase/functions/_shared/logging.ts`, que sigue
 * duplicado a propósito: las edge functions corren en Deno aislado y no pueden
 * importar de este paquete. Esa copia además NO es equivalente —diverge con un
 * `throw` de un no-objeto, donde aquí `typeof` es la única fuente válida—, así
 * que no es candidata a unificación.
 */
/**
 * Gramática de un campo de diagnóstico que sí se puede loguear.
 *
 * Exportada porque "esto no es un secreto" tiene que ser una decisión
 * verificable, no una convención: la usan `safeField`/`readErrorCode` y también
 * la lista de variables de entorno de `EnvironmentConfigError` de la API, que
 * viaja a un log estructurado con la misma promesa de no filtrar nada.
 */
export const SAFE_ERROR_FIELD = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

export interface SafeErrorFields {
	errorType: string;
	errorCode?: string;
}

function safeField(value: unknown, fallback: string): string {
	return typeof value === "string" && SAFE_ERROR_FIELD.test(value)
		? value
		: fallback;
}

function readErrorCode(error: unknown): string | undefined {
	// `'code' in error` exige un objeto: un `throw "texto"` o un `throw null` no
	// tienen código y no deben romper la lectura del diagnóstico.
	if (!error || typeof error !== "object" || !("code" in error))
		return undefined;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" && SAFE_ERROR_FIELD.test(code)
		? code
		: undefined;
}

/**
 * Devuelve campos de diagnóstico acotados, sin mensajes, stacks, `cause` ni
 * payloads. Es la única forma en que un cliente debería reportar un error.
 */
export function safeErrorFields(error: unknown): SafeErrorFields {
	const errorType = safeField(
		error instanceof Error ? error.name : typeof error,
		"UnknownError",
	);
	const errorCode = readErrorCode(error);
	return errorCode ? { errorType, errorCode } : { errorType };
}

/** Une tipo y código (`"TypeError:E42"`) para logs de una sola línea. */
export function safeErrorSummary(error: unknown): string {
	const fields = safeErrorFields(error);
	return fields.errorCode
		? `${fields.errorType}:${fields.errorCode}`
		: fields.errorType;
}
