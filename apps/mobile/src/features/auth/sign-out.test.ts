import { beforeEach, describe, expect, jest, mock, test } from "bun:test";

import { mockNativeUi } from "@/src/test-utils/native-mocks";

// El logout nunca se bloquea por la desvinculación del token push, pero la fila
// en `device_tokens` no puede quedar abandonada: si el `DELETE` falla,
// Supabase sigue entregando push a un dispositivo cuya sesión ya se cerró.

const storage = new Map<string, string>();
const deleteDeviceTokens = jest.fn();
const signOut = jest.fn();
const clearStore = jest.fn();
const clearCache = jest.fn();
const replaced: string[] = [];

const STORAGE_KEY = "role.pending-device-token-revocation.v1";

mockNativeUi();

mock.module("expo-constants", () => ({
	default: { appOwnership: "standalone", expoConfig: {} },
}));

mock.module("expo-router", () => ({
	router: { replace: (path: string) => replaced.push(path) },
}));

mock.module("@react-native-async-storage/async-storage", () => ({
	default: {
		getItem: jest.fn(async (key: string) => storage.get(key) ?? null),
		setItem: jest.fn(async (key: string, value: string) => {
			storage.set(key, value);
		}),
		removeItem: jest.fn(async (key: string) => {
			storage.delete(key);
		}),
	},
}));

mock.module("@/src/features/notifications/data/repository", () => ({
	deleteDeviceTokens,
	upsertDeviceToken: jest.fn(),
}));

mock.module("@/src/features/auth/data/repository", () => ({
	authRepository: { signOut },
}));

mock.module("@/src/features/auth/store", () => ({
	useAuthStore: {
		getState: () => ({ profile: { id: "user-1" }, clear: clearStore }),
	},
}));

mock.module("@/src/core/query/client", () => ({
	queryClient: { clear: clearCache },
}));

const { performSignOut } = await import("./sign-out");
const { pendingDeviceTokenRevocationRepository } = await import(
	"@/src/features/notifications"
);

describe("cierre de sesión", () => {
	beforeEach(() => {
		storage.clear();
		replaced.length = 0;
		deleteDeviceTokens.mockReset();
		signOut.mockReset();
		signOut.mockResolvedValue(undefined);
		clearStore.mockReset();
		clearCache.mockReset();
	});

	test("cierra sesión y deja reintentable la revocación si el DELETE falla", async () => {
		deleteDeviceTokens.mockRejectedValue(new Error("sin red"));

		await performSignOut();

		expect(signOut).toHaveBeenCalledTimes(1);
		expect(clearStore).toHaveBeenCalledTimes(1);
		expect(clearCache).toHaveBeenCalledTimes(1);
		expect(replaced).toEqual(["/(auth)/login"]);
		// Sin este registro el token sobrevive al logout para siempre.
		expect(storage.get(STORAGE_KEY)).toContain("user-1");
	});

	test("un drenado posterior borra el registro cuando la API responde", async () => {
		deleteDeviceTokens.mockRejectedValueOnce(new Error("sin red"));
		await performSignOut();
		expect(storage.has(STORAGE_KEY)).toBe(true);

		await expect(
			pendingDeviceTokenRevocationRepository.drain("user-1"),
		).resolves.toBe(true);
		expect(storage.has(STORAGE_KEY)).toBe(false);
	});

	test("una revocación confirmada no deja registro pendiente", async () => {
		deleteDeviceTokens.mockResolvedValue(undefined);

		await performSignOut();

		expect(deleteDeviceTokens).toHaveBeenCalledWith("user-1");
		expect(storage.has(STORAGE_KEY)).toBe(false);
	});
});
