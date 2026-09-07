/** Valores del tema en `user_preferences.theme_mode` (columna sin CHECK en DB; defaults a `system`). */
export const THEME_MODES = ['light', 'dark', 'system'] as const;

export type ThemeMode = (typeof THEME_MODES)[number];
