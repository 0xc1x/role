import { ExecutionContext, Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AccessLogInterceptor } from './access-log.interceptor';
import { JsonLoggerService } from '../logging/json-logger.service';
import {
  getRequestContext,
  runWithRequestContext,
} from '../logging/request-context';

type Captured = Record<string, unknown>;

interface Scenario {
  status?: number;
  route?: string;
  user?: { id: string; role: string };
  error?: boolean;
}

/** Monta contexto + handler SIN tocar el logger (para tests de integración). */
function scenario(options: Scenario) {
  const request = {
    method: 'GET',
    user: options.user,
    route: { path: options.route ?? '/api/v1/offers' },
  };
  const response = { statusCode: options.status ?? 200 };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return {
    interceptor: new AccessLogInterceptor(),
    context,
    next: {
      handle: () =>
        options.error ? throwError(() => new Error('boom')) : of('ok'),
    },
    request,
    response,
  };
}

/**
 * Igual que `scenario`, pero sustituye `Logger.prototype` por spies para
 * capturar los campos SIN serializar.
 *
 * Los spies se instalan sobre el prototipo, así que interceptan la llamada
 * ANTES de que llegue a `staticInstanceRef` (el logger instalado por
 * `overrideLogger`). Por eso el test de integración usa `scenario`, no
 * `harness`: necesita que la línea llegue al JsonLoggerService real.
 */
function harness(options: Scenario) {
  const logged: { level: 'log' | 'debug'; fields: Captured }[] = [];
  jest
    .spyOn(Logger.prototype, 'log')
    .mockImplementation((fields: Captured) => {
      logged.push({ level: 'log', fields });
    });
  jest
    .spyOn(Logger.prototype, 'debug')
    .mockImplementation((fields: Captured) => {
      logged.push({ level: 'debug', fields });
    });
  return { ...scenario(options), logged };
}

function settle(
  interceptor: AccessLogInterceptor,
  context: ExecutionContext,
  next: { handle: () => ReturnType<typeof of> },
): Promise<void> {
  return new Promise((resolve, reject) => {
    runWithRequestContext(
      { requestId: 'req-000042', method: 'GET', startedAt: Date.now() },
      () => {
        interceptor.intercept(context, next).subscribe({
          next: () => resolve(),
          error: () => resolve(),
        });
      },
    );
  });
}

describe('AccessLogInterceptor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loguea método, ruta, status y duración de una petición exitosa', async () => {
    const { interceptor, context, next, logged } = harness({});

    await settle(interceptor, context, next);

    expect(logged).toHaveLength(1);
    expect(logged[0]!.level).toBe('log');
    // `requestId` NO va aquí: lo inyecta `JsonLoggerService` al serializar,
    // leyendo el mismo contexto. Este test sustituye el logger por un spy, así
    // que la línea que ve es la de ENCIMA del logger — el cableado del
    // requestId se prueba en `json-logger.service.spec.ts`.
    expect(logged[0]!.fields).toMatchObject({
      event: 'http_request',
      method: 'GET',
      route: '/api/v1/offers',
      status: 200,
      durationMs: expect.any(Number),
    });
  });

  it('de extremo a extremo: el interceptor aporta los campos y el logger la correlación', async () => {
    // Esta es la cadena real de producción (`app.useLogger` + interceptor +
    // ALS). El `requestId` no lo pone ninguno de los dos por su cuenta: lo
    // inyecta el logger leyendo el contexto. Sin este test, los dos sides
    // pasarían por separado y la unión seguiría sin correlacionar.
    const out: string[] = [];
    Logger.overrideLogger(
      new JsonLoggerService({ write: (line) => out.push(line) }),
    );

    try {
      const { interceptor, context, next } = scenario({});
      await settle(interceptor, context, next);

      expect(out).toHaveLength(1);
      expect(JSON.parse(out[0]!)).toMatchObject({
        level: 'info',
        event: 'http_request',
        method: 'GET',
        route: '/api/v1/offers',
        status: 200,
        context: 'AccessLog',
        requestId: 'req-000042',
      });
    } finally {
      Logger.overrideLogger([]);
      jest.restoreAllMocks();
    }
  });

  it('asocia el actor autenticado al contexto para los logs posteriores', async () => {
    const { interceptor, context, next } = harness({
      user: { id: 'user-7', role: 'business_owner' },
    });
    let captured: { userId?: string; role?: string } = {};

    runWithRequestContext(
      { requestId: 'req-000042', method: 'GET', startedAt: Date.now() },
      () => {
        interceptor
          .intercept(context, {
            handle: () => {
              captured = {
                userId: getRequestContext()?.userId,
                role: getRequestContext()?.role,
              };
              return of('ok');
            },
          })
          .subscribe();

        expect(captured).toEqual({
          userId: 'user-7',
          role: 'business_owner',
        });
      },
    );

    expect(next).toBeDefined();
  });

  it('omite la línea cuando la petición lanzó excepción (la registra el filtro)', async () => {
    const { interceptor, context, next, logged } = harness({ error: true });

    await settle(interceptor, context, next);

    expect(logged).toHaveLength(0);
  });

  it('omite 4xx y 5xx para no duplicar la línea del filtro', async () => {
    const denied = harness({ status: 403 });
    await settle(denied.interceptor, denied.context, denied.next);
    expect(denied.logged).toHaveLength(0);

    jest.restoreAllMocks();

    const broken = harness({ status: 500 });
    await settle(broken.interceptor, broken.context, broken.next);
    expect(broken.logged).toHaveLength(0);
  });

  it('degrada /health a debug para no inundar el archivo', async () => {
    const { interceptor, context, next, logged } = harness({
      route: '/api/v1/health',
      status: 200,
    });

    await settle(interceptor, context, next);

    expect(logged[0]!.level).toBe('debug');
  });

  it('una petición anónima no inventa un userId', async () => {
    const { interceptor, context, next, logged } = harness({});

    await settle(interceptor, context, next);

    expect(logged[0]!.fields.userId).toBeUndefined();
  });
});

describe('AccessLogInterceptor sin contexto activo', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('loguea igual, pero sin durationMs inventado', (done) => {
    const logged: Captured[] = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((fields: Captured) => {
        logged.push(fields);
        expect(fields.durationMs).toBeUndefined();
        expect(fields.requestId).toBeUndefined();
        done();
      });

    const interceptor = new AccessLogInterceptor();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', route: { path: '/api/v1/offers' } }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    interceptor
      .intercept(context, { handle: () => of('ok') })
      .subscribe(() => undefined);
  });
});

// El interceptor no debe romper la firma que Nest espera de un filtro global.
describe('AccessLogInterceptor contrato', () => {
  it('no captura la excepción: la propaga al filtro', (done) => {
    const interceptor = new AccessLogInterceptor();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'GET', route: { path: '/x' } }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    interceptor
      .intercept(context, {
        handle: () => throwError(() => new Error('boom')),
      })
      .subscribe({
        next: () => done(new Error('no debía emitir')),
        error: (err: Error) => {
          expect(err.message).toBe('boom');
          done();
        },
      });
  });
});