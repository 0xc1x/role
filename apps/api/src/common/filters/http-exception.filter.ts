import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { safeErrorFields } from '@0xc1x/role-commons';
import {
  elapsedMs,
  getRequestContext,
  resolveRequestId,
  safeRoute,
} from '../logging/request-context';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';
    let error = 'Internal Server Error';
    let details: unknown;

    // El id sale del contexto de petición cuando existe, no de releer la cabecera:
    // el middleware fijó AMBOS (request y response) del mismo generador, así que
    // son equivalentes en producción — pero el contexto es el que lee el resto
    // de la cadena (logger, interceptor), y tomarlo del mismo sitio es lo que
    // hace imposible que se desincronicen. Sin contexto (filtro usado suelto,
    // tests), cae a la cabecera y luego al generador.
    const requestId =
      getRequestContext()?.requestId ??
      resolveRequestId(request.headers['x-request-id']);

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string | string[]) ?? message;
        error = (obj.error as string) ?? exception.name;
        details = obj.details;
      }
      // Antes solo se logueaba >= 500. Un 401 (token vencido), un 403 (rol
      // insuficiente) o un 429 (abuso) eran invisibles: el status ya está en
      // la respuesta del cliente, pero no quedaba registro de en qué endpoint
      // وقوع ni de quién. Ahora van a `warn`, por debajo de `error`.
      this.logException(
        'http_exception',
        exception,
        requestId,
        request,
        status,
      );
    } else if (exception instanceof Error) {
      this.logException(
        'unhandled_exception',
        exception,
        requestId,
        request,
        status,
      );
    } else {
      this.logException(
        'unknown_exception',
        exception,
        requestId,
        request,
        status,
      );
    }

    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      // `ThrottlerException` trae `'ThrottlerException: Too Many Requests'` como
      // mensaje por defecto, y como 429 es < 500 no lo cubre la redacción de
      // abajo: el nombre de la clase se iba literal a la pantalla del operador.
      // El límite y su redacción son del throttle, no del handler.
      message =
        'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.';
      error = 'Too Many Requests';
      details = undefined;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      message = 'Error interno del servidor';
      error = 'Internal Server Error';
      details = undefined;
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      path: request.path,
      timestamp: new Date().toISOString(),
      requestId,
      ...(details !== undefined ? { details } : {}),
    });
  }

  private logException(
    event: string,
    exception: unknown,
    requestId: string,
    request: Request,
    status: number,
  ): void {
    const fields = {
      event,
      ...safeErrorFields(exception),
      requestId,
      route: safeRoute(request),
      method: request.method,
      status,
    };
    const active = getRequestContext();
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({
        ...fields,
        ...(active ? { durationMs: elapsedMs(active.startedAt) } : {}),
        ...(active?.userId ? { userId: active.userId } : {}),
      });
      return;
    }
    this.logger.warn(fields);
  }
}
