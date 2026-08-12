import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env.schema';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';
    let error = 'Internal Server Error';
    let details: unknown;

    const requestId = (request.headers['x-request-id'] as string) || crypto.randomUUID();

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
    } else if (exception instanceof Error) {
      this.logger.error({
        message: exception.message,
        stack: exception.stack,
        requestId,
        path: request.url,
        method: request.method,
      });
    } else {
      this.logger.error({
        message: 'Unknown exception',
        exception: String(exception),
        requestId,
        path: request.url,
        method: request.method,
      });
    }

    const isProduction = this.config.get('NODE_ENV') === 'production';
    if (isProduction && !(exception instanceof HttpException)) {
      message = 'Error interno del servidor';
      error = 'Internal Server Error';
      details = undefined;
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId,
      ...(details !== undefined ? { details } : {}),
    });
  }
}
