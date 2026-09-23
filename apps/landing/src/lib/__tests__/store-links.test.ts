import { describe, expect, test } from "bun:test";
import {
	detectOS,
	PWA_FALLBACK,
	resolveStoreLink,
	resolveStoreLinks,
} from "../store-links";

describe("detectOS", () => {
	test("detecta ios / android / other", () => {
		expect(
			detectOS(
				"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit",
			),
		).toBe("ios");
		expect(detectOS("Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)")).toBe(
			"ios",
		);
		expect(detectOS("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(
			"android",
		);
		expect(detectOS("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(
			"other",
		);
		expect(detectOS("")).toBe("other");
	});
});

describe("resolveStoreLink", () => {
	test("usa store URL según OS y cae a PWA", () => {
		expect(resolveStoreLink("ios", "https://ios", "https://play")).toBe(
			"https://ios",
		);
		expect(resolveStoreLink("android", "https://ios", "https://play")).toBe(
			"https://play",
		);
		expect(resolveStoreLink("other", "https://ios", "https://play")).toBe(
			PWA_FALLBACK,
		);
		expect(resolveStoreLink("ios", "", "")).toBe(PWA_FALLBACK);
		expect(resolveStoreLink("android", "", "")).toBe(PWA_FALLBACK);
	});

	test("usa el PWA configurado (store.default) como fallback", () => {
		expect(
			resolveStoreLink("other", "https://ios", "https://play", "https://pwa"),
		).toBe("https://pwa");
		expect(resolveStoreLink("ios", "", "", "https://pwa")).toBe(
			"https://pwa",
		);
		expect(resolveStoreLink("other", "", "", "")).toBe(PWA_FALLBACK);
	});
});

describe("resolveStoreLinks", () => {
	test("resuelve badges con fallback a PWA", () => {
		expect(resolveStoreLinks("https://ios", "https://play")).toEqual({
			ios: "https://ios",
			android: "https://play",
			pwa: PWA_FALLBACK,
		});
		expect(resolveStoreLinks("", "")).toEqual({
			ios: PWA_FALLBACK,
			android: PWA_FALLBACK,
			pwa: PWA_FALLBACK,
		});
	});

	test("resuelve badges con el PWA configurado", () => {
		expect(
			resolveStoreLinks("https://ios", "https://play", "https://pwa"),
		).toEqual({
			ios: "https://ios",
			android: "https://play",
			pwa: "https://pwa",
		});
		expect(resolveStoreLinks("", "", "https://pwa")).toEqual({
			ios: "https://pwa",
			android: "https://pwa",
			pwa: "https://pwa",
		});
	});
});
