// Required `app_config` rows (create in admin; no DB writes from landing):
//   social.tiktok_url, social.facebook_url, social.youtube_url,
//   store.play_url, store.ios_url, store.default
// Each row: value_type=url, category=links, is_public=true, active=true
// (store.default dummy: https://app.role.ec).
// Missing/empty values fall back safely (socials hidden, store links → PWA fallback).
import { useConfig } from "./use-config";

export const PWA_FALLBACK = "https://app.role.ec";

export type StoreOS = "ios" | "android" | "other";

/** Pure UA → OS mapping (testable without navigator). */
export function detectOS(userAgent: string): StoreOS {
	const ua = userAgent.toLowerCase();
	if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
		return "ios";
	}
	if (ua.includes("android")) return "android";
	return "other";
}

/** SSR-safe OS detection: 'other' when navigator is unavailable. */
export function getOS(): StoreOS {
	if (typeof navigator === "undefined" || !navigator.userAgent) return "other";
	return detectOS(navigator.userAgent);
}

/** Pure resolver: OS-aware store URL with PWA fallback. */
export function resolveStoreLink(
	os: StoreOS,
	iosUrl: string,
	playUrl: string,
	pwaUrl: string = PWA_FALLBACK,
): string {
	if (os === "ios" && iosUrl) return iosUrl;
	if (os === "android" && playUrl) return playUrl;
	return pwaUrl || PWA_FALLBACK;
}

/** Pure resolver for the badges section (each falls back to the PWA URL). */
export function resolveStoreLinks(
	iosUrl: string,
	playUrl: string,
	pwaUrl: string = PWA_FALLBACK,
) {
	const pwa = pwaUrl || PWA_FALLBACK;
	return {
		ios: iosUrl || pwa,
		android: playUrl || pwa,
		pwa,
	};
}

/** OS-aware download link: store URL when available, else PWA. */
export function useStoreLink(): string {
	const iosUrl = useConfig("store.ios_url", "");
	const playUrl = useConfig("store.play_url", "");
	const pwaUrl = useConfig("store.default", PWA_FALLBACK);
	return resolveStoreLink(getOS(), iosUrl, playUrl, pwaUrl);
}

/** Resolved {ios, android, pwa} links for badges sections. */
export function useStoreLinks() {
	const iosUrl = useConfig("store.ios_url", "");
	const playUrl = useConfig("store.play_url", "");
	const pwaUrl = useConfig("store.default", PWA_FALLBACK);
	return resolveStoreLinks(iosUrl, playUrl, pwaUrl);
}
