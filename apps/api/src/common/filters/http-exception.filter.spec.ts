import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

function mockHost(headers: Record<string, string> = {}) {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = {
    headers,
    route: { path: '/api/v1/businesses' },
    path: '/api/v1/businesses',
    url: '/api/v1/businesses?email=private@example.com',
    method: 'POST',
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, response, request };
}

function makeFilter() {
  return new AllExceptionsFilter();
}

describe('AllExceptionsFilter', () => {
  it('mapea HttpException con cuerpo string (mensaje literal)', () => {
    const filter = makeFilter();
    const { host, response } = mockHost();

    filter.catch(new BadRequestException('Slug already exists'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Slug already exists',
        error: 'Bad Request',
        path: '/api/v1/businesses',
        requestId: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });

  it('mapea HttpException con cuerpo objeto incluyendo details (Zod pipe)', () => {
    const filter = makeFilter();
    const { host, response } = mockHost();

    const details = [{ path: 'name', message: 'Too short' }];
    filter.catch(
      new BadRequestException({
        message: 'Validation failed',
        error: 'Bad Request',
        details,
      }),
      host,
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Validation failed',
        error: 'Bad Request',
        details,
      }),
    );
  });

  it('usa el x-request-id entrante cuando existe', () => {
    const filter = makeFilter();
    const { host, response } = mockHost({ 'x-request-id': 'req-000042' });

    filter.catch(new BadRequestException('x'), host);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-000042' }),
    );
  });

  it('en producción enmascara errores no-HTTP con mensaje genérico', () => {
    const filter = makeFilter();
    const { host, response } = mockHost();

    filter.catch(new Error('password is hunter2 at db://prod'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Error interno del servidor',
        error: 'Internal Server Error',
      }),
    );
    expect(response.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.anything() }),
    );
  });

  it('en desarrollo deja pasar el detalle de errores no-HTTP pero mantiene 500', () => {
    const filter = makeFilter();
    const { host, response } = mockHost();

    filter.catch(new Error('connection refused'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    // El mensaje por defecto del filtro se mantiene (no exponen el del error).
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Error interno del servidor',
      }),
    );
  });

  it('redacts exception messages, stacks, causes, and request query data from logs', () => {
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const filter = makeFilter();
    const { host } = mockHost({ 'x-request-id': 'req-000042' });
    const error = Object.assign(new Error('password=secret'), {
      name: 'DatabaseError',
      code: '08006',
      cause: new Error('private-key=secret'),
    });

    filter.catch(error, host);

    expect(logError).toHaveBeenCalledWith({
      event: 'unhandled_exception',
      errorType: 'DatabaseError',
      errorCode: '08006',
      requestId: 'req-000042',
      route: '/api/v1/businesses',
      method: 'POST',
    });
    const logged = JSON.stringify(logError.mock.calls);
    expect(logged).not.toContain('secret');
    expect(logged).not.toContain('private@example.com');
    logError.mockRestore();
  });

  it('masks internal HttpException messages in every environment', () => {
    const filter = makeFilter();
    const { host, response } = mockHost();

    filter.catch(
      new InternalServerErrorException('database password=secret'),
      host,
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Error interno del servidor',
        error: 'Internal Server Error',
      }),
    );
  });

  it('excepciones que no son Error (throw de primitivos) también responden 500', () => {
    const filter = makeFilter();
    const { host, response } = mockHost();

    filter.catch('boom', host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    );
  });
});
