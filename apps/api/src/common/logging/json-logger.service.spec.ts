import { JsonLoggerService, stackFrames } from './json-logger.service';
import {
  REQUEST_ID_PATTERN,
  resolveRequestId,
  runWithRequestContext,
  setRequestContextUser,
} from './request-context';

function collector() {
  const lines: { line: string; stream: 'stdout' | 'stderr' }[] = [];
  return {
    lines,
    sink: (line: string, stream: 'stdout' | 'stderr') => {
      lines.push({ line, stream });
    },
    parse(index = 0) {
      return JSON.parse(lines[index]!.line) as Record<string, unknown>;
    },
  };
}

describe('ERROR_STACK', () => {
  /** Reproduce el caso real: message con PII + frames limpios. */
  function leakedError() {
    const err = new Error('password=hunter2 at db://prod:5432');
    err.name = 'DatabaseError';
    Object.assign(err, { code: '08006' });
    return err;
  }

  it('off por default: ni el message ni los frames salen', () => {
    const out = collector();
    const logger = new JsonLoggerService({ write: out.sink });

    logger.error(leakedError());

    expect(out.parse().stack).toBeUndefined();
    expect(out.lines[0]!.line).not.toContain('hunter2');
    expect(out.lines[0]!.line).not.toContain('at ');
  });

  it('full emite los frames y NUNCA el message', () => {
    const out = collector();
    const logger = new JsonLoggerService({
      errorStack: 'full',
      write: out.sink,
    });

    logger.error(leakedError());

    const record = out.parse();
    expect(record.stack).toEqual(expect.any(Array));
    expect(record.stack.length).toBeGreaterThan(0);
    // El frame del test es identificable: sirve para localizar el fallo.
    expect(record.stack[0]).toContain('at ');
    // Y el message — el canal de PII — sigue sin aparecer.
    expect(out.lines[0]!.line).not.toContain('hunter2');
    expect(out.lines[0]!.line).not.toContain('db://prod');
    expect(out.lines[0]!.line).not.toContain('password=');
  });

  it('full conserva errorType/errorCode junto al stack', () => {
    const out = collector();
    const logger = new JsonLoggerService({
      errorStack: 'full',
      write: out.sink,
    });

    logger.error(leakedError());

    expect(out.parse()).toMatchObject({
      level: 'error',
      errorType: 'DatabaseError',
      errorCode: '08006',
    });
  });

  it('un call site no puede colar su propio stack si está en off', () => {
    // La promesa "el logger no emite stacks" no puede depender de que quien
    // llama recuerde redactar.
    const out = collector();
    const logger = new JsonLoggerService({ write: out.sink });

    logger.error({
      event: 'boom',
      stack: 'Error: hunter2\n    at leak (/srv/secret.js:1:1)',
    });

    expect(out.parse().stack).toBeUndefined();
    expect(out.lines[0]!.line).not.toContain('hunter2');
  });

  it('no toca los eventos de negocio: el stack es solo de error', () => {
    const out = collector();
    const logger = new JsonLoggerService({
      errorStack: 'full',
      write: out.sink,
    });

    logger.log({ event: 'orders_expiration_completed', expired: 3 });

    expect(out.parse().stack).toBeUndefined();
  });

  it('warn no recibe stack aunque ERROR_STACK=full', () => {
    // Un 4xx es tráfico normal: no se quiere el stack de cada 401.
    const out = collector();
    const logger = new JsonLoggerService({
      errorStack: 'full',
      write: out.sink,
    });

    logger.warn({ event: 'http_exception', status: 401 });

    expect(out.parse().stack).toBeUndefined();
  });

  it('sin Error real no inventa un stack', () => {
    const out = collector();
    const logger = new JsonLoggerService({
      errorStack: 'full',
      write: out.sink,
    });

    logger.error('boom');

    expect(out.parse().stack).toBeUndefined();
  });
});

describe('stackFrames', () => {
  it('descarta la línea 0 y devuelve solo frames', () => {
    const err = new Error('secreto');
    const frames = stackFrames(err);

    expect(frames?.every((f) => f.startsWith('at '))).toBe(true);
    expect(frames?.join('\n')).not.toContain('secreto');
  });

  it('devuelve undefined para un objeto sin stack', () => {
    expect(stackFrames('boom')).toBeUndefined();
    expect(stackFrames({ event: 'x' })).toBeUndefined();
    expect(stackFrames(undefined)).toBeUndefined();
  });

  it('descarta solo el frame contaminado y conserva los limpios', () => {
    // `new Error(\`falló para ${email}\`)` dentro de una arrow function deja el
    // email en el NOMBRE del frame. Perder el stack entero tiraría los frames
    // de al lado, que son los que localizean el fallo.
    const err = new Error('x');
    err.stack = [
      'Error: hunter2',
      '    at usuario hunter2@example.com (src/a.ts:1:1)',
      '    at clean (src/b.ts:2:2)',
    ].join('\n');

    const frames = stackFrames(err);

    expect(frames).toEqual(['at clean (src/b.ts:2:2)']);
    expect(frames?.join('\n')).not.toContain('hunter2');
  });

  it('conserva frames con rutas de node: y sin ruta', () => {
    const err = new Error('x');
    err.stack = [
      'TypeError: boom',
      '    at Loader._resolveFilename (node:internal/modules/cjs/loader:1155:19)',
      '    at [eval]:1:1',
      '    at Object.<anonymous> (/srv/app/dist/main.js:9:11)',
    ].join('\n');

    expect(stackFrames(err)).toHaveLength(3);
  });
});

describe('JsonLoggerService', () => {
  describe('formato', () => {
    it('emite una línea JSON por evento, sin Object(N) ni multilínea', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });

      logger.error({
        event: 'app_config_list_failed',
        errorType: 'DatabaseError',
        errorCode: '08006',
      });

      expect(out.lines).toHaveLength(1);
      expect(out.lines[0]!.line).not.toContain('\n');
      expect(out.lines[0]!.line).toContain('"event":"app_config_list_failed"');
      expect(out.parse()).toMatchObject({
        level: 'error',
        event: 'app_config_list_failed',
        errorType: 'DatabaseError',
        errorCode: '08006',
        time: expect.any(String),
      });
    });

    it('manda error a stderr y el resto a stdout', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });

      logger.error({ event: 'boom' });
      logger.log({ event: 'ok' });

      // Solo `error` va a stderr: un agregador separa fallos del resto sin
      // parsear. `warn` se queda en stdout porque un 4xx —un token vencido, un
      // 429 de throttling— es tráfico normal, no un fallo del servicio.
      expect(out.lines.map((l) => l.stream)).toEqual(['stderr', 'stdout']);
    });

    it('mapea el `log` de Nest a `info` y acepta `log` como umbral', () => {
      const out = collector();
      const logger = new JsonLoggerService({ level: 'log', write: out.sink });

      logger.log('hello');

      expect(out.parse()).toMatchObject({ level: 'info', msg: 'hello' });
    });

    it('conserva el context de Nest como campo, no como prefijo', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });

      logger.log({ event: 'x' }, 'OffersService');

      expect(out.parse()).toMatchObject({ event: 'x', context: 'OffersService' });
    });
  });

  describe('niveles', () => {
    it('descarta lo que queda por debajo del umbral', () => {
      const out = collector();
      const logger = new JsonLoggerService({ level: 'warn', write: out.sink });

      logger.error({ event: 'e' });
      logger.warn({ event: 'w' });
      logger.log({ event: 'i' });
      logger.debug({ event: 'd' });
      logger.verbose({ event: 'v' });

      expect(out.lines.map((l) => JSON.parse(l.line).event)).toEqual(['e', 'w']);
    });

    it('por defecto sale `info` (los eventos de negocio) y no `debug`', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });

      logger.log({ event: 'orders_expiration_completed' });
      logger.debug({ event: 'contact_delivery_mocked' });

      expect(out.lines).toHaveLength(1);
      expect(out.parse()).toMatchObject({
        event: 'orders_expiration_completed',
      });
    });

    it('`debug` deja pasar todo lo anterior', () => {
      const out = collector();
      const logger = new JsonLoggerService({ level: 'debug', write: out.sink });

      logger.debug({ event: 'contact_delivery_mocked' });

      expect(out.parse()).toMatchObject({
        level: 'debug',
        event: 'contact_delivery_mocked',
      });
    });
  });

  describe('redacción', () => {
    it('un Error crudo se reduce a errorType/errorCode: nunca message ni stack', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });
      const err = Object.assign(new Error('password=hunter2'), {
        name: 'DatabaseError',
        code: '08006',
        cause: new Error('private-key=secret'),
      });

      logger.error(err);

      const record = out.parse();
      expect(record).toMatchObject({
        errorType: 'DatabaseError',
        errorCode: '08006',
      });
      expect(record.message).toBeUndefined();
      expect(out.lines[0]!.line).not.toContain('hunter2');
      expect(out.lines[0]!.line).not.toContain('secret');
      expect(out.lines[0]!.line).not.toContain('stack');
    });

    it('el `stack` que Nest firma en error() se descarta siempre', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });

      logger.error(
        { event: 'boom' },
        'Error: at Object.<anonymous> (/srv/apps/api/dist/main.js:1:1)',
        'Ctx',
      );

      expect(out.lines[0]!.line).not.toContain('/srv/apps/api');
      expect(out.parse()).toMatchObject({ event: 'boom', context: 'Ctx' });
    });
  });

  describe('correlación con la petición', () => {
    it('añade requestId/userId/role del contexto activo', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });

      runWithRequestContext(
        { requestId: 'req-000042', method: 'GET', startedAt: Date.now() },
        () => {
          setRequestContextUser('user-1', 'admin');
          logger.error({ event: 'slides_list_failed', errorType: 'Error' });
        },
      );

      expect(out.parse()).toMatchObject({
        event: 'slides_list_failed',
        requestId: 'req-000042',
        userId: 'user-1',
        role: 'admin',
      });
    });

    it('un call site que fija su propio requestId gana al del contexto', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });

      runWithRequestContext(
        { requestId: 'from-als', method: 'GET', startedAt: Date.now() },
        () => {
          logger.error({ event: 'x', requestId: 'from-callsite' });
        },
      );

      expect(out.parse().requestId).toBe('from-callsite');
    });

    it('fuera de una petición no inventa un requestId', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });

      logger.log({ event: 'payout_generation_completed' });

      expect(out.parse().requestId).toBeUndefined();
    });

    it('no arrastra contexto de una petición a la siguiente', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });

      runWithRequestContext(
        { requestId: 'req-1', method: 'GET', startedAt: Date.now() },
        () => logger.log({ event: 'first' }),
      );
      logger.log({ event: 'second' });

      expect(out.parse(0).requestId).toBe('req-1');
      expect(out.parse(1).requestId).toBeUndefined();
    });
  });

  describe('robustez', () => {
    it('un grafo circular degrada a una línea mínima en vez de lanzar', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });
      const cyclic: Record<string, unknown> = { event: 'cyclic' };
      cyclic.self = cyclic;

      expect(() => logger.log(cyclic)).not.toThrow();

      expect(out.parse()).toMatchObject({
        level: 'info',
        event: 'log_serialization_failed',
      });
    });

    it('un primitiveThrown se serializa como msg sin romperse', () => {
      const out = collector();
      const logger = new JsonLoggerService({ write: out.sink });

      logger.error('boom');

      expect(out.parse()).toMatchObject({ level: 'error', msg: 'boom' });
    });
  });
});

describe('resolveRequestId', () => {
  it('acepta un id entrante que cumple la gramática', () => {
    expect(resolveRequestId('req-000042')).toBe('req-000042');
  });

  it('rechaza un id que no la cumple y genera uno nuevo', () => {
    // Un id con salto de línea permitiría inyectar una línea de log falsa en el
    // archivo, así que la gramática lo rechaza aunque el valor "parezca" un id.
    const hostile = 'abc\n{"event":"forged"}';
    const resolved = resolveRequestId(hostile);

    expect(resolved).not.toBe(hostile);
    expect(resolved).toMatch(REQUEST_ID_PATTERN);
    expect(resolved).not.toContain('\n');
  });

  it('genera un id válido cuando no hay ninguno', () => {
    expect(resolveRequestId(undefined)).toMatch(REQUEST_ID_PATTERN);
    expect(resolveRequestId(42)).toMatch(REQUEST_ID_PATTERN);
  });
});