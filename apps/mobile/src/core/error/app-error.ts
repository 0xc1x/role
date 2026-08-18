/**
 * Typed application error taxonomy.
 *
 * Screens catch these (or the raw PostgrestError via `toAppError`) and
 * map them to user-facing messages through `message()`.
 */

export type ErrorKind =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'business_rule'
  | 'unknown';

export class AppError extends Error {
  readonly kind: ErrorKind;
  /** Stable machine-readable code (e.g. 'OFFER_UNAVAILABLE'). */
  readonly code?: string;
  /** Extra context for observability. */
  readonly context?: Record<string, unknown>;

  constructor(kind: ErrorKind, message: string, code?: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.code = code;
    this.context = context;
  }

  static of(kind: ErrorKind, message: string, code?: string): AppError {
    return new AppError(kind, message, code);
  }

  toJSON() {
    return {
      kind: this.kind,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}

export const Errors = {
  network: (message = 'Error de conexión. Revisa tu internet e inténtalo de nuevo.') =>
    AppError.of('network', message),
  unauthorized: (message = 'Debes iniciar sesión para continuar.') =>
    AppError.of('unauthorized', message),
  forbidden: (message = 'No tienes permiso para realizar esta acción.') =>
    AppError.of('forbidden', message),
  notFound: (message = 'No encontramos lo que buscabas.') =>
    AppError.of('not_found', message),
  validation: (message = 'Revisa los datos ingresados.') =>
    AppError.of('validation', message),
  conflict: (message = 'Ese elemento ya existe.') => AppError.of('conflict', message),
  businessRule: (message: string, code?: string) => AppError.of('business_rule', message, code),
  unknown: (message = 'Algo salió mal. Inténtalo de nuevo.') => AppError.of('unknown', message),
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
