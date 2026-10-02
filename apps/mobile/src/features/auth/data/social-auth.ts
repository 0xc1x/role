/**
 * Pure OAuth helpers for the hosted social-login flow (Flow A).
 *
 * Supabase owns the provider handshake; the app only opens the authorize URL
 * and comes back with `?code=`. These helpers stay dependency-free (no
 * react-native, no Linking) so they run in `bun test` with zero mocks.
 */

/** Deep-link return for native (must be allowlisted in Supabase redirect URLs). */
export const NATIVE_OAUTH_REDIRECT_URL = "role://callback";

/**
 * Extracts the PKCE `code` Supabase appends to the return URL.
 * Returns null when absent or unparseable — the caller maps that to a
 * user-facing error, never a crash.
 */
export function extractOAuthCode(url: string): string | null {
	try {
		const code = new URL(url).searchParams.get("code");
		return code && code.length > 0 ? code : null;
	} catch {
		return null;
	}
}
