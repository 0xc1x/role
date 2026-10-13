import type { NextFunction, Request, Response } from 'express';
import { resolveRequestId, runWithRequestContext } from './request-context';

/**
 * Middleware que abre el contexto de correlación de cada petición.
 *
 * Arregla el defecto que hacía la correlación imposible: antes solo se
 * escribía la CABECERA DE RESPUESTA, así que el filtro de excepciones leía
 * `req.headers['x-request-id']`, encontraba `undefined` y generaba un segundo
 * UUID. El `requestId` que el cliente veía en el body del 500 y el `requestId`
 * de la línea de log eran, sistemáticamente, distintos.
 *
 * Ahora el id se fija en los tres sitios a la vez — store, request y response —
 * desde un único generador, y `runWithRequestContext` deja el resto de la
 * petición (servicio, repositorio, filtro) dentro del contexto sin que nada
 * tenga que recibirlo por parámetro.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(req.headers['x-request-id']);
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  runWithRequestContext(
    { requestId, method: req.method, startedAt: Date.now() },
    next,
  );
}