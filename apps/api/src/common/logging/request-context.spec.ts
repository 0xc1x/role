import type { NextFunction, Request, Response } from 'express';
import { requestContextMiddleware } from './request-context.middleware';
import {
  elapsedMs,
  getRequestContext,
  runWithRequestContext,
  setRequestContextUser,
} from './request-context';

function mockReqRes(headers: Record<string, string> = {}) {
  const setHeader = jest.fn();
  const req = {
    headers,
    method: 'POST',
    route: { path: '/api/v1/businesses' },
  } as unknown as Request;
  const res = { setHeader } as unknown as Response;
  return { req, res, setHeader };
}

describe('requestContextMiddleware', () => {
  it('reinyecta el id en la request: el filtro lee el MISMO que el cliente', () => {
    const { req, res, setHeader } = mockReqRes();
    const next = jest.fn() as NextFunction;

    requestContextMiddleware(req, res, next);

    // Este es el defecto que se corrigió: el id tiene que estar en los tres
    // sitios (request, response, contexto) y salir del MISMO generador.
    const onRequest = req.headers['x-request-id'];
    expect(onRequest).toEqual(expect.any(String));
    expect(setHeader).toHaveBeenCalledWith('x-request-id', onRequest);
  });

  it('respeta un x-request-id entrante válido', () => {
    const { req, res } = mockReqRes({ 'x-request-id': 'req-000042' });

    requestContextMiddleware(req, res, jest.fn() as NextFunction);

    expect(req.headers['x-request-id']).toBe('req-000042');
  });

  it('sustituye un id entrante malicioso por uno generado', () => {
    const { req, res } = mockReqRes({ 'x-request-id': 'a\nb' });

    requestContextMiddleware(req, res, jest.fn() as NextFunction);

    expect(req.headers['x-request-id']).not.toContain('\n');
  });

  it('abre el contexto durante la ejecución de next()', () => {
    const { req, res } = mockReqRes();
    let captured: string | undefined;

    requestContextMiddleware(req, res, () => {
      captured = getRequestContext()?.requestId;
    });

    expect(captured).toBe(req.headers['x-request-id'] as string);
  });

  it('el contexto queda cerrado después de la respuesta', () => {
    const { req, res } = mockReqRes();

    requestContextMiddleware(req, res, jest.fn() as NextFunction);

    expect(getRequestContext()).toBeUndefined();
  });
});

describe('request context', () => {
  it('no hay contexto fuera del ciclo de una petición', () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it('setRequestContextUser es no-op sin contexto activo', () => {
    // Un cron que arranque antes del primer request no debe Romper.
    expect(() => setRequestContextUser('user-1', 'admin')).not.toThrow();
  });

  it('el contexto no sobrevive a la salida de run()', () => {
    runWithRequestContext(
      { requestId: 'req-1', method: 'GET', startedAt: Date.now() },
      () => setRequestContextUser('user-1'),
    );

    expect(getRequestContext()).toBeUndefined();
  });

  it('elapsedMs nunca es negativo aunque el reloj retroceda', () => {
    expect(elapsedMs(Date.now() + 10_000)).toBe(0);
    expect(elapsedMs(Date.now() - 25)).toBeGreaterThanOrEqual(25);
  });
});