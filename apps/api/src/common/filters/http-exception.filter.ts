import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { safeErrorFields } from '../utils/safe-error';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function safeRequestId(value: unknown): string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
    ? value
    : crypto.randomUUID();
}

function safeRoute(request: Request): string {
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

    const requestId = safeRequestId(request.headers['x-request-id']);

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
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logException('http_exception', exception, requestId, request);
      }
    } else if (exception instanceof Error) {
      this.logException('unhandled_exception', exception, requestId, request);
    } else {
      this.logException('unknown_exception', exception, requestId, request);
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
  ): void {
    this.logger.error({
      event,
      ...safeErrorFields(exception),
      requestId,
      route: safeRoute(request),
      method: request.method,
    });
  }
}
