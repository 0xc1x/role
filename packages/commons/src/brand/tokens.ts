/**
 * Brand tokens — single source of truth for the Rolé palette.
 *
 * To rebrand colors: edit the hex values here, run `bun run brand:sync`
 * from `packages/commons`, then rebuild the apps.
 */
export const BRAND_PRIMARY = "#371949";
export const BRAND_PRIMARY_DARK = "#311743";
export const BRAND_PAPER = "#FEFDFD";
export const BRAND_CREAM = "#FCFBF3";
export const BRAND_ACCENT = "#B582E4";
export const BRAND_ACCENT_LIGHT = "#CD9DFA";

/** Splash / PWA background shared by landing, admin and mobile. */
export const BRAND_SPLASH_BACKGROUND = BRAND_PRIMARY_DARK;

/**
 * Cache-busting query applied to `/icon.svg` and `/favicon.ico` links in
 * `apps/admin` and `apps/landing` (`?v=N`). Bump it inside `brand:sync`
 * whenever generated assets change so browsers fetch the new artwork.
 */
export const BRAND_ASSET_VERSION = 5;
