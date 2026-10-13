import type { LoggerService } from '@nestjs/common';
import { safeErrorFields } from '@0xc1x/role-commons';
import { getRequestContext } from './request-context';

/**
 * Logger de la API: una línea JSON por evento.
 *
 * POR QUÉ EXISTE: los `logger.error({ event, ...err })` del codebase ya eran
 * estructurados en el argumento, pero `ConsoleLogger` de Nest los imprimía
 * con `util.inspect` — multilínea, con prefijo `Object(5)` y sin comillas. Eso
 * no es parseable por un agregador de líneas (Render incluido), así que
 * "tenemos logs estructurados" era una intención, no un hecho.
 *
 * POR QUÉ NO pino: `app.useLogger()` sustituye el delegate estático que usan
 * los ~20 `new Logger(X.name)` ya escritos. Con pino habría que convertir cada
 * servicio a `PinoLogger` (API incompatible) o convivir con dos formatos de
 * log. Aquí se arregla el formato sin tocar un solo call site.
 *
 * GARANTÍA DE REDACCIÓN: este logger nunca escribe un stack, ni un `message`,
 * ni un `cause`. Un `Error` pasado tal cual se reduce a `errorType`/
 * `errorCode` con el mismo `safeErrorFields` que ya usaban los servicios, y el
 * parámetro `stack` de `error()` se descarta por completo. Es la segunda capa
 * de la defensa descrita en `packages/commons/src/_common/utils/safe-error.ts`:
 * si mañana alguien loguea un error crudo, la línea sale acotada igual.
 */
export type JsonLogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'verbose';

/** Nivel configurable por `LOG_LEVEL`. Mismo vocabulario que emite. */
export type JsonLogLevelOption = JsonLogLevel | 'log';

/** `ERROR_STACK`: `off` (default) o `full` (solo frames, nunca el message). */
export type JsonErrorStack = 'off' | 'full';

type LogRecord = Record<string, unknown>;

/**
 * Menor rank = más severo. Un evento se emite si su rank no supera el umbral
 * configurado (`LOG_LEVEL=warn` deja pasar warn y error, y descarta info).
 */
const RANK: Record<JsonLogLevel, number> = {
  fatal: 0,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4,
};

export interface JsonLoggerOptions {
  /** Umbral por defecto: `info`. `log` es alias de `info` (vocabulario Nest). */
  level?: JsonLogLevelOption;
  /**
   * `full` añade los FRAMES del stack (archivo y línea) a los eventos de
   * error. Default `off`: fail-closed, una variable no seteada no filtra.
   *
   * NUNCA incluye el `message` del error — ver `stackFrames`.
   */
  errorStack?: JsonErrorStack;
  /**
   * Sumidero de líneas. Por defecto escribe a stdout/stderr; los tests inyectan
   * un array para no ensuciar la salida del runner.
   */
  write?: (line: string, stream: 'stdout' | 'stderr') => void;
}

function isPlainObject(value: unknown): value is LogRecord {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
}

function defaultSink(line: string, stream: 'stdout' | 'stderr'): void {
  // `error`/`fatal` a stderr: un agregador puede separar fallos del resto sin
  // parsear. Un `write` parcial de una línea de ~200 bytes es improbable, pero
  // no puede dejar la línea partida en dos registros.
  const target = stream === 'stderr' ? process.stderr : process.stdout;
  target.write(line.endsWith('\n') ? line : `${line}\n`);
}

/**
 * Convierte el primer argumento de un método `LoggerService` en campos.
 *
 * Un objeto plano se despliega (los servicios ya loguean `{ event, ... }`); un
 * `Error` se reduce a su huella acotada; el resto viaja como `msg`.
 */
function toFields(message: unknown): LogRecord {
  if (message instanceof Error) return { ...safeErrorFields(message) };
  if (isPlainObject(message)) return { ...message };
  if (typeof message === 'string') return { msg: message };
  return { msg: String(message) };
}

/**
 * Separa `context` (último string, por convención de Nest) del resto, y recoge
 * en `extras` los objetos adicionales que aporta el call site.
 */
function splitParams(
  params: readonly unknown[],
): { context?: string; extras: LogRecord; messages: string[] } {
  const rest = [...params];
  let context: string | undefined;
  const last = rest[rest.length - 1];
  if (typeof last === 'string') {
    rest.pop();
    context = last;
  }

  const extras: LogRecord = {};
  const messages: string[] = [];
  for (const param of rest) {
    if (param instanceof Error) Object.assign(extras, safeErrorFields(param));
    else if (isPlainObject(param)) Object.assign(extras, param);
    else if (typeof param === 'string') messages.push(param);
  }
  return { context, extras, messages };
}

/**
 * Los frames de un stack, SIN la primera línea.
 *
 * POR QUÉ RECORTAR: un stack de V8 es `"<Name>: <message>\n    at ...\n    at ..."`.
 * La línea 0 es el `message` — el canal por el que salen PII, y la razón de que
 * exista `EnvironmentConfigError` separando `variables` de `message`. Los frames
 * son `at fn (file:line:col)` y no llevan datos del error.
 *
 * El message también puede aparecer interpolado DENTRO de un frame si el código
 * hace `new Error(\`falló para ${email}\`)` en una función con nombre — por eso
 * cada frame se valida por separado contra una gramática cerrada, y el que no
 * la cumple se descarta (los demás sobreviven).
 *
 * El recorte de la línea 0 es la garantía principal, no una convención: por
 * debajo de ella no hay `message` por construcción del formato de V8.
 */
const STACK_FRAME = /^\s*at\s+(.*)$/;
const MAX_FRAMES = 20;

/**
 * Un frame se parte en dos: el NOMBRE de la función (donde un message
 * interpolado se colaría: `at usuario hunter2@example.com (...)`) y la
 * UBICACIÓN (una ruta del proyecto, que es el dato que se quiere).
 *
 * Se validan por separado porque tienen gramáticas distintas: el nombre solo
 * admite identificadores y espacios simples; la ruta admite separadores de
 * path pero ni comillas ni espacios.
 */
const FRAME_NAME = /^[A-Za-z0-9_$.<>]+(?: [A-Za-z0-9_$.<>]+)*$/;
const FRAME_LOCATION = /^[A-Za-z0-9_./:\\[\]@ -]+$/;

/**
 * Un frame es seguro si lo son sus dos mitades por separado.
 *
 * El filtrado es POR FRAME, no todo-o-nada: un stack con un frame contaminado
 * conserva el resto. Descartarlo entero perdería justo los frames de al lado,
 * que son los que localizean el fallo.
 */
function isSafeFrame(frame: string): boolean {
  const match = STACK_FRAME.exec(frame);
  if (!match) return false;
  const rest = match[1]!.trim();
  const open = rest.lastIndexOf(' (');
  // V8 tiene dos formas de frame: `fn (file:line:col)` —con paréntesis— y
  // `file:line:col` a secas, que es lo que emite para `[eval]` y para
  // `node:internal`. Sin paréntesis no hay nombre que pueda llevar el message.
  if (open === -1) return FRAME_LOCATION.test(rest);
  return (
    FRAME_NAME.test(rest.slice(0, open)) &&
    FRAME_LOCATION.test(rest.slice(open + 2, -1))
  );
}

/** Extrae frames utilizables, sin la línea del message. */
export function stackFrames(error: unknown): string[] | undefined {
  if (!(error instanceof Error) || typeof error.stack !== 'string') {
    return undefined;
  }
  const frames = error.stack
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(isSafeFrame)
    .slice(0, MAX_FRAMES);
  return frames.length > 0 ? frames : undefined;
}

export class JsonLoggerService implements LoggerService {
  private readonly minRank: number;
  private readonly errorStack: JsonErrorStack;
  private readonly sink: (line: string, stream: 'stdout' | 'stderr') => void;

  constructor(options: JsonLoggerOptions = {}) {
    const level = options.level ?? 'info';
    this.minRank = RANK[level === 'log' ? 'info' : level];
    this.errorStack = options.errorStack ?? 'off';
    this.sink = options.write ?? defaultSink;
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('info', message, optionalParams);
  }

  /**
   * El `stack` que Nest firma aquí nunca se escribe TAL CUAL: su línea 0 es el
   * `message` crudo, el canal prohibido. Con `ERROR_STACK=full` se escriben
   * solo los frames, y solo cuando el objeto recibido es un `Error` real — un
   * stack que llega como string se descarta igual.
   */
  error(message: unknown, stack?: string, context?: string): void {
    void stack;
    this.emit('error', message, [context]);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.emit('fatal', message, optionalParams);
  }

  private emit(
    level: JsonLogLevel,
    message: unknown,
    params: readonly unknown[],
  ): void {
    if (RANK[level] > this.minRank) return;

    const { context, extras, messages } = splitParams(params);
    const fields = toFields(message);
    if (messages.length > 0) {
      const joined = [fields.msg, ...messages]
        .filter((part): part is string => typeof part === 'string')
        .join(' ');
      fields.msg = joined;
    }

    const record: LogRecord = {
      time: new Date().toISOString(),
      level,
      ...(context ? { context } : {}),
      ...fields,
      ...extras,
    };

    if (this.errorStack === 'full' && isSevere(level)) {
      // El `Error` original, no los fields ya reducidos: `toFields` lo convirtió
      // a errorType/errorCode y el stack se lee del objeto, no del log.
      const frames = stackFrames(message);
      if (frames) record.stack = frames;
    } else {
      // Un call site que pase su propio campo `stack` no lo esquiva: sin
      // `ERROR_STACK=full` el logger no emite stacks, y esa promesa no depende
      // de que quien llama recuerde redactar.
      delete record.stack;
    }

    this.enrichFromRequest(record);
    this.sink(this.serialize(record), isSevere(level) ? 'stderr' : 'stdout');
  }

  /**
   * Añade la correlación de la petición en curso.
   *
   * Un valor explícito en el call site GANA: el filtro y los tests pueden pasar
   * su propio `requestId` sin contexto activo, y sin esta precedencia un
   * `undefined` del store borraría el que el caller sí sabe.
   */
  private enrichFromRequest(record: LogRecord): void {
    const context = getRequestContext();
    if (!context) return;
    if (record.requestId === undefined) record.requestId = context.requestId;
    if (record.userId === undefined && context.userId !== undefined) {
      record.userId = context.userId;
    }
    if (record.role === undefined && context.role !== undefined) {
      record.role = context.role;
    }
  }

  /**
   * Una línea, sin segunda pasada de parseo. Un grafo circular o un BigInt
   * harían lanzar `JSON.stringify` — y un logger que lanza al loguear un error
   * es un logger que se come el error que iba a reportar, así que el fallo
   * degrada a una línea mínima en vez de propagarse.
   */
  private serialize(record: LogRecord): string {
    try {
      return JSON.stringify(record);
    } catch {
      return JSON.stringify({
        time: record.time,
        level: record.level,
        event: 'log_serialization_failed',
        errorType: 'TypeError',
      });
    }
  }
}

function isSevere(level: JsonLogLevel): boolean {
  return level === 'error' || level === 'fatal';
}