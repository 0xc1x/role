import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request } from 'express';

/**
 * Contexto de correlación de una petición, disponible para CUALQUIER log que
 * se emita mientras la petición vive — sin que ningún servicio tenga que
 * recibir ni propagar el `requestId` por parámetro.
 *
 * POR QUÉ EXISTE: el `requestId` se emitía solo en dos sitios (el header de
 * respuesta y el filtro de excepciones), así que el log de un fallo de servicio
 * (`app_config_list_failed`) no se podía correlacionar con el `http_exception`
 * del filtro más que por ventana temporal. Peor: el middleware solo escribía el
 * header de RESPUESTA, de modo que el filtro leía `req.headers['x-request-id']`,
 * encontraba `undefined` y generaba un UUID DISTINTO del que el cliente
 * recibía. Dos identificadores para la misma petición: la correlación era
 * imposible por construcción.
 *
 * `AsyncLocalStorage` es lo que arregla ambas cosas a la vez: el middleware
 * fija el `requestId` en la petición Y en el store, y tanto el logger como el
 * filtro y el interceptor de acceso leen el mismo valor de un solo sitio.
 */
export interface RequestContext {
  /** Id de correlación: el mismo que viaja en la cabecera `x-request-id`. */
  readonly requestId: string;
  readonly method: string;
  /** `Date.now()` de entrada, para reconstruir la duración de la petición. */
  readonly startedAt: number;
  /** Llenado por el guard vía `setRequestContextUser`; ausente si es anónimo. */
  userId?: string;
  role?: string;
}

/**
 * Gramática del id de correlación. La misma que valida el filtro: un valor
 * recibido que no la cumple no se propaga (un atacante podría inyectar saltos
 * de línea o fields espurios en el log), se sustituye por uno generado.
 */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

const storage = new AsyncLocalStorage<RequestContext>();

/** Ejecuta `fn` con el contexto activo (lo usan middleware y tests). */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

/**
 * Contexto de la petición en curso, o `undefined` fuera del ciclo de una
 * petición (jobs, bootstrap, tests).
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Asocia el usuario autenticado al contexto de la petición en curso.
 *
 * Lo llama el interceptor de acceso, que corre DESPUÉS de los guards: es el
 * primer punto donde `request.user` está poblado sin que el guard tenga que
 * conocer el store.
 */
export function setRequestContextUser(userId: string, role?: string): void {
  const context = storage.getStore();
  if (!context) return;
  context.userId = userId;
  if (role !== undefined) context.role = role;
}

/** Id válido de un valor entrante, o uno generado si no cumple la gramática. */
export function resolveRequestId(value: unknown): string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
    ? value
    : crypto.randomUUID();
}

/**
 * Patrón de ruta, nunca la URL.
 *
 *POR QUÉ la ruta y no la URL: `request.path` y `request.url` llevan query
 * strings, y las query strings son datos de negocio (`?email=...`). El patrón
 * de la ruta identifica el endpoint sin filtrar nada.
 */
export function safeRoute(request: Request): string {
  // Express types `request.route` as `any`, and `any & T` is still `any`, so an
  // intersection does not help. Widen through `unknown` first: every read below
  // is then genuinely unchecked and the guards can actually reject it.
  const view = request as unknown as Record<string, unknown>;
  const route = view.route;
  const path =
    typeof route === 'object' && route !== null
      ? (route as Record<string, unknown>).path
      : undefined;
  return typeof path === 'string' && path.length <= 128 ? path : 'unmatched';
}

/** Milisegundos transcurridos desde el inicio de la petición. */
export function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}