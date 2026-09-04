import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from './http-exception.filter';

function mockHost(headers: Record<string, string> = {}) {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = {
    headers,
    url: '/api/v1/businesses',
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

function makeFilter(nodeEnv?: string) {
  const config = {
    get: jest.fn((key: string) => (key === 'NODE_ENV' ? nodeEnv : undefined)),
  } as unknown as ConfigService<never, true>;
  return new AllExceptionsFilter(config);
}

describe('AllExceptionsFilter', () => {
  it('mapea HttpException con cuerpo string (mensaje literal)', () => {
    const filter = makeFilter('development');
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
    const filter = makeFilter('development');
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
    const filter = makeFilter('production');
    const { host, response } = mockHost({ 'x-request-id': 'req-42' });

    filter.catch(new BadRequestException('x'), host);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'req-42' }),
    );
  });

  it('en producción enmascara errores no-HTTP con mensaje genérico', () => {
    const filter = makeFilter('production');
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
    const filter = makeFilter('development');
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

  it('excepciones que no son Error (throw de primitivos) también responden 500', () => {
    const filter = makeFilter('production');
    const { host, response } = mockHost();

    filter.catch('boom', host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    );
  });
});
