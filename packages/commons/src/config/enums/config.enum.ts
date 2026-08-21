export const APP_CONFIG_VALUE_TYPES = [
  'string',
  'text',
  'number',
  'boolean',
  'email',
  'url',
  'phone',
] as const;

export type AppConfigValueType = (typeof APP_CONFIG_VALUE_TYPES)[number];

export const AppConfigValueType = {
  STRING: 'string',
  TEXT: 'text',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  EMAIL: 'email',
  URL: 'url',
  PHONE: 'phone',
} as const satisfies Record<string, AppConfigValueType>;

export const APP_CONFIG_CATEGORIES = [
  'contacto',
  'financiero',
  'reglas',
  'geolocalizacion',
  'links',
  'marketing',
  'legal',
  'general',
] as const;

export type AppConfigCategory = (typeof APP_CONFIG_CATEGORIES)[number];
