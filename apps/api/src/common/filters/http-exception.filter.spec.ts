import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';
import {
  runWithRequestContext,
  setRequestContextUser,
} from '../logging/request-context';

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
  let logError: jest.SpyInstance;
  let logWarn: jest.SpyInstance;

  beforeEach(() => {
    logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    logWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    logError.mockRestore();
    logWarn.mockRestore();
  });

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

  it('un 429 no muestra el nombre de la clase de excepción al operador', () => {
    const filter = makeFilter();
    const { host, response } = mockHost();

    // Exactamente lo que produce `ThrottlerException` de @nestjs/throttler.
    filter.catch(
      new HttpException(
        { statusCode: 429, message: 'ThrottlerException: Too Many Requests' },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    const body = response.json.mock.calls[0]?.[0];
    expect(body.statusCode).toBe(429);
    expect(body.error).toBe('Too Many Requests');
    expect(body.message).toBe(
      'Demasiadas peticiones. Espera un momento e inténtalo de nuevo.',
    );
    // El nombre de la clase no puede aparecer por ninguna clave de la respuesta.
    expect(JSON.stringify(body)).not.toContain('ThrottlerException');
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

  it('el requestId de la respuesta es el mismo que pone el middleware', () => {
    // El defecto que se corrigió: el middleware solo escribía la cabecera de
    // RESPUESTA, así que el filtro leía `req.headers[...]`, encontraba
    // `undefined` y generaba un segundo UUID distinto al que veía el cliente.
    const filter = makeFilter();
    const { host, response } = mockHost();
    const middlewareId = 'req-from-middleware';

    runWithRequestContext(
      {
        requestId: middlewareId,
        method: 'POST',
        startedAt: Date.now(),
      },
      () => {
        filter.catch(new BadRequestException('x'), host);
      },
    );

    const logged = logWarn.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    const body = response.json.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;

    expect(body?.requestId).toBe(middlewareId);
    expect(logged?.requestId).toBe(middlewareId);
  });

  it('loguea los 4xx a warn: antes un 401/403/429 no dejaba rastro', () => {
    const filter = makeFilter();
    const { host } = mockHost({ 'x-request-id': 'req-000042' });

    filter.catch(new UnauthorizedException('Missing access token'), host);

    expect(logError).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http_exception',
        status: 401,
        route: '/api/v1/businesses',
        requestId: 'req-000042',
      }),
    );
  });

  it('incluye la duración y el actor cuando hay contexto de petición', () => {
    const filter = makeFilter();
    const { host } = mockHost({ 'x-request-id': 'req-000042' });

    runWithRequestContext(
      {
        requestId: 'req-000042',
        method: 'POST',
        startedAt: Date.now() - 30,
      },
      () => {
        setRequestContextUser('user-7', 'admin');
        filter.catch(new InternalServerErrorException('db down'), host);
      },
    );

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http_exception',
        status: 500,
        userId: 'user-7',
        durationMs: expect.any(Number),
      }),
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
    const filter = makeFilter();
    const { host } = mockHost({ 'x-request-id': 'req-000042' });
    const error = Object.assign(new Error('password=secret'), {
      name: 'DatabaseError',
      code: '08006',
      cause: new Error('private-key=secret'),
    });

    filter.catch(error, host);

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'unhandled_exception',
        errorType: 'DatabaseError',
        errorCode: '08006',
        requestId: 'req-000042',
        route: '/api/v1/businesses',
        method: 'POST',
        status: 500,
      }),
    );
    const logged = JSON.stringify(logError.mock.calls);
    expect(logged).not.toContain('secret');
    expect(logged).not.toContain('private@example.com');
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
