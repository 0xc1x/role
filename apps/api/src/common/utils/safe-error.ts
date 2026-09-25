const SAFE_ERROR_FIELD = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

export interface SafeErrorFields {
  errorType: string;
  errorCode?: string;
}

function safeField(value: unknown, fallback: string): string {
  return typeof value === 'string' && SAFE_ERROR_FIELD.test(value)
    ? value
    : fallback;
}

function readErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error))
    return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && SAFE_ERROR_FIELD.test(code)
    ? code
    : undefined;
}

/** Returns bounded diagnostic fields without messages, stacks, causes, or payloads. */
export function safeErrorFields(error: unknown): SafeErrorFields {
  const errorType = safeField(
    error instanceof Error ? error.name : typeof error,
    'UnknownError',
  );
  const errorCode = readErrorCode(error);
  return errorCode ? { errorType, errorCode } : { errorType };
}

export function safeErrorSummary(error: unknown): string {
  const fields = safeErrorFields(error);
  return fields.errorCode
    ? `${fields.errorType}:${fields.errorCode}`
    : fields.errorType;
}
