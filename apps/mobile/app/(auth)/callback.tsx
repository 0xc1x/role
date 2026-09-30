import { useEffect } from "react";
import { router } from "expo-router";

import { LoadingView } from "@/src/core/ui";
import { useAuthStore } from "@/src/features/auth/store";

/**
 * OAuth return target (serves path `/callback`: route groups are stripped).
 *
 * Web (PWA): Supabase redirects the page here and `detectSessionInUrl`
 * completes the session automatically; this screen only waits for the store
 * and forwards through the role-aware index gate. Native warm returns never
 * navigate (openAuthSessionAsync resolves in place); this route covers web
 * and native cold-start links.
 */
export default function OAuthCallback() {
	const initialized = useAuthStore((s) => s.initialized);
	const status = useAuthStore((s) => s.status);

	useEffect(() => {
		if (!initialized || status === "loading") return;
		router.replace(status === "authenticated" ? "/" : "/(auth)/login");
	}, [initialized, status]);

	return <LoadingView />;
}
