import { beforeEach, describe, expect, jest, mock, test } from "bun:test";

import { mockNativeUi } from "@/src/test-utils/native-mocks";

// Desactivar el push con un `DELETE` fallido dejaba la fila de `device_tokens`
// viva: el usuario seguía recibiendo push con su preferencia en "off". Es el
// mismo defecto que corrigió `a5623f1` para el logout, así que comparte su
// mecanismo: un write-ahead que solo se borra cuando la API confirma.

const storage = new Map<string, string>();
const deleteDeviceTokens = jest.fn();

// El barrel de la feature llega a expo-router y react-native; sin esto bun
// intenta transpilar los Flow types del runtime nativo.
mockNativeUi();

mock.module("expo-constants", () => ({
	default: { appOwnership: "standalone", expoConfig: {} },
}));

mock.module("expo-router", () => ({
	router: { push: () => {}, replace: () => {} },
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

const { revokeDeviceTokensWithRetry, pendingDeviceTokenRevocationRepository } =
	await import("./index");

const STORAGE_KEY = "role.pending-device-token-revocation.v1";

describe("revokeDeviceTokensWithRetry", () => {
	beforeEach(() => {
		storage.clear();
		deleteDeviceTokens.mockReset();
		deleteDeviceTokens.mockResolvedValue(undefined);
	});

	test("una revocación confirmada no deja registro pendiente", async () => {
		await revokeDeviceTokensWithRetry("user-1");

		expect(deleteDeviceTokens).toHaveBeenCalledWith("user-1");
		expect(storage.has(STORAGE_KEY)).toBe(false);
	});

	test("un DELETE fallido deja la revocación reintentable", async () => {
		deleteDeviceTokens.mockRejectedValue(new Error("sin red"));

		await revokeDeviceTokensWithRetry("user-1");

		// Sin este registro el token sobrevive para siempre y el usuario recibe
		// push aunque su preferencia diga "off".
		expect(storage.get(STORAGE_KEY)).toContain("user-1");

		// Y el drenado del próximo arranque autenticado lo completa.
		deleteDeviceTokens.mockResolvedValue(undefined);
		await expect(
			pendingDeviceTokenRevocationRepository.drain("user-1"),
		).resolves.toBe(true);
		expect(storage.has(STORAGE_KEY)).toBe(false);
	});

	test("el registro se escribe antes de tocar la red", async () => {
		let scheduledBeforeDelete = false;
		deleteDeviceTokens.mockImplementation(async () => {
			scheduledBeforeDelete = storage.has(STORAGE_KEY);
		});

		await revokeDeviceTokensWithRetry("user-1");

		expect(scheduledBeforeDelete).toBe(true);
	});
});
