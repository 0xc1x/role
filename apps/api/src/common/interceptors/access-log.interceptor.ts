import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, tap, type Observable } from 'rxjs';
import type { AuthUser } from '../../auth/auth.types';
import {
  elapsedMs,
  getRequestContext,
  safeRoute,
  setRequestContextUser,
} from '../logging/request-context';

type RequestWithUser = Request & { user?: AuthUser };

/**
 * Access log: una línea por petición que termina bien.
 *
 * POR QUÉ EXISTE: sin esto, una petición exitosa no dejaba rastro alguno. No
 * había forma de responder "¿quién llamó a este endpoint y cuánto tardó?",
 * porque ningún log del codebase registra una ruta con código 200.
 *
 * POR QUÉ solo las exitosas: toda excepción pasa por `AllExceptionsFilter`, que
 * ya loguea 4xx (warn) y 5xx (error) con ruta, método y `requestId`. Aquí se
 * registra el complementary — lo que pasó cuando NO hubo excepción — para no
 * duplicar la misma petición en dos líneas. En particular, los 401/403 de los
 * guards nunca llegan a este interceptor (los guards corren antes), y por eso
 * los loguea el filtro y no el interceptor.
 */
@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AccessLog');

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();
    const response = http.getResponse<Response>();

    // Los guards ya corrieron cuando llega aquí, así que `request.user` está
    // poblado. Es el punto más barato para asociar el actor al contexto, y lo
    // hace el propio interceptor en vez de meter store en el guard.
    if (request.user) {
      setRequestContextUser(request.user.id, request.user.role);
    }

    let failed = false;
    return next.handle().pipe(
      tap({
        error: () => {
          failed = true;
        },
      }),
      finalize(() => {
        if (!failed) this.log(request, response);
      }),
    );
  }

  private log(request: RequestWithUser, response: Response): void {
    const status = response.statusCode;
    // Una excepción que se propagó la registra el filtro; `failed` ya cubre ese
    // caso. Este guardia cubre el residual (p. ej. un 404 del router, que no
    // lanza excepción y sí es una petición que el operador quiere ver).
    if (status >= 400) return;

    const active = getRequestContext();
    const route = safeRoute(request);
    const fields = {
      event: 'http_request',
      method: request.method,
      route,
      status,
      ...(active ? { durationMs: elapsedMs(active.startedAt) } : {}),
      ...(active?.userId ? { userId: active.userId, role: active.role } : {}),
    };

    // `/health` lo golpea el probe de Render cada pocos segundos: a nivel `log`
    // desplazaría el resto del ruido del archivo. `debug` lo deja disponible
    // para diagnóstico sin coste en producción.
    if (route.endsWith('/health')) this.logger.debug(fields);
    else this.logger.log(fields);
  }
}