export const APP_ROLES = ['user', 'business', 'admin'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const AppRole = {
  USER: 'user',
  BUSINESS: 'business',
  ADMIN: 'admin',
} as const satisfies Record<string, AppRole>;
