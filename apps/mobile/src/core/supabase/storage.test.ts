import { describe, expect, test } from "bun:test";

import { createNativeStorage, createWebStorage } from "./storage-adapter";

describe("Supabase session storage", () => {
	test("uses the browser storage contract on web", async () => {
		const values = new Map<string, string>();
		const storage = createWebStorage({
			getItem: (key) => values.get(key) ?? null,
			setItem: (key, value) => void values.set(key, value),
			removeItem: (key) => void values.delete(key),
		});

		await storage.setItem("session", "token");
		expect(await storage.getItem("session")).toBe("token");
		await storage.removeItem("session");
		expect(await storage.getItem("session")).toBeNull();
	});

	test("uses SecureStore on native", async () => {
		const values = new Map<string, string>();
		const storage = createNativeStorage({
			getItemAsync: async (key) => values.get(key) ?? null,
			setItemAsync: async (key, value) => void values.set(key, value),
			deleteItemAsync: async (key) => void values.delete(key),
		});

		await storage.setItem("session", "secure-token");
		expect(await storage.getItem("session")).toBe("secure-token");
		await storage.removeItem("session");
		expect(await storage.getItem("session")).toBeNull();
	});
});
