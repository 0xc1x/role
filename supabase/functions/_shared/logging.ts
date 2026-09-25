const SAFE_ERROR_FIELD = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

export interface SafeErrorFields {
  errorType: string;
  errorCode?: string;
}

function safeField(value: unknown, fallback: string): string {
  return typeof value === "string" && SAFE_ERROR_FIELD.test(value)
    ? value
    : fallback;
}

export function safeErrorFields(error: unknown): SafeErrorFields {
  const candidate = error && typeof error === "object"
    ? error as { name?: unknown; code?: unknown }
    : undefined;
  const errorType = safeField(candidate?.name, "UnknownError");
  const errorCode =
    typeof candidate?.code === "string" && SAFE_ERROR_FIELD.test(candidate.code)
      ? candidate.code
      : undefined;
  return errorCode ? { errorType, errorCode } : { errorType };
}
