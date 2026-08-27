import type { AppConfigValueType } from '../enums/config.enum';
import type { AppConfigMap } from '../dtos/config.dto';

/**
 * Convierte el valor crudo (JSONB) al tipo declarado en `value_type`.
 * Tolerante: si el valor no coincide con el tipo declarado devuelve `fallback`.
 */
export function coerceConfigValue(
  raw: unknown,
  valueType: AppConfigValueType,
  fallback?: string | number | boolean,
): string | number | boolean {
  switch (valueType) {
    case 'number':
      return typeof raw === 'number' ? raw : (fallback as number);
    case 'boolean':
      return typeof raw === 'boolean' ? raw : (fallback as boolean);
    default:
      return typeof raw === 'string' ? raw : (fallback as string);
  }
}

export function getConfigValue<T extends string | number | boolean>(
  map: AppConfigMap | undefined,
  key: string,
  fallback: T,
): T {
  const value = map?.[key];
  if (value === undefined || value === null) return fallback;
  return typeof value === typeof fallback ? (value as T) : fallback;
}
