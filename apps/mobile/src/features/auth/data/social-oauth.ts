import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Platform } from "react-native";

import { supabase } from "@/src/core/supabase/client";
import { Errors } from "@/src/core/error/app-error";
import { strings } from "@/src/core/i18n/strings";

import type { UserProfile } from "../domain/user";
import { enrichProfile, mapAuthError, profileFromUser } from "./repository";
import { extractOAuthCode, NATIVE_OAUTH_REDIRECT_URL } from "./social-auth";

/**
 * Hosted social login, Flow A (one flow for PWA + native).
 *
 * Lives outside `repository.ts` on purpose: the embedded-auth sheet needs
 * react-native imports, and `repository.ts` must stay importable by unit
 * tests that run without the native runtime.
 *
 * Supabase owns the provider handshake; the app only opens the authorize URL
 * and comes back with `?code=`. On native `signInWithOAuth` never
 * auto-redirects (no `window`), so the URL is opened in the embedded auth
 * sheet and the returned code is exchanged manually. On web the library
 * redirects the page itself and `detectSessionInUrl` completes the session —
 * this function returns right after the authorize call there.
 *
 * Returns null when the user dismisses the sheet: a silent no-op, same
 * posture as Apple's `ERR_REQUEST_CANCELED`. Do NOT pass
 * `skipBrowserRedirect`: the installed auth-js types don't declare it
 * (excess-property error) and native doesn't need it anyway.
 */
export async function signInWithProvider(
	provider: "google" | "apple",
	options?: { forceAccountPicker?: boolean },
): Promise<UserProfile | null> {
	// Web: Linking.createURL prefixes the current origin (verified in the
	// installed expo-linking). Both URLs must be allowlisted in Supabase
	// redirect URLs or the provider refuses the return.
	const redirectTo =
		Platform.OS === "web"
			? Linking.createURL("/callback")
			: NATIVE_OAUTH_REDIRECT_URL;
	const { data, error } = await supabase.auth.signInWithOAuth({
		provider,
		options: {
			redirectTo,
			// The auth sheet shares the system cookie jar, so Google/Apple see
			// the account already signed in and re-authenticate it silently —
			// the account chooser never appears, which reads as "the app just
			// logged me back in". `prompt` makes the provider ask. Signup asks
			// (choosing the identity is the point of registering); login does
			// not (one tap for the single-account user). Both providers accept
			// `select_account` on their authorize endpoint.
			...(options?.forceAccountPicker
				? { queryParams: { prompt: "select_account" } }
				: {}),
		},
	});
	if (error) throw mapAuthError(error);
	if (!data.url) throw Errors.unknown(strings.auth.socialLoginFailed);

	if (Platform.OS === "web") return null;

	const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
	if (result.type !== "success" || !result.url) return null;
	const code = extractOAuthCode(result.url);
	if (!code) throw Errors.unknown(strings.auth.socialLoginFailed);

	const { data: exchanged, error: exchangeError } =
		await supabase.auth.exchangeCodeForSession(code);
	if (exchangeError) throw mapAuthError(exchangeError);
	const user = exchanged.user;
	if (!user) throw Errors.unauthorized(strings.auth.noUserOnLogin);
	return enrichProfile(profileFromUser(user));
}
