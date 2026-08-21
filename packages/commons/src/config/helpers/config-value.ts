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

/** Lee una clave del mapa de config con fallback seguro. */
export function getConfigValue<K extends string>(
  map: AppConfigMap | undefined,
  key: K,
  fallback: string,
): string;
export function getConfigValue<K extends string>(
  map: AppConfigMap | undefined,
  key: K,
  fallback: number,
): number;
export function getConfigValue<K extends string>(
  map: AppConfigMap | undefined,
  key: K,
  fallback: boolean,
): boolean;
export function getConfigValue(
  map: AppConfigMap | undefined,
  key: string,
  fallback: string | number | boolean,
): string | number | boolean {
  const value = map?.[key];
  if (value === undefined || value === null) return fallback;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  return fallback;
}
