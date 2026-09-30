import { beforeEach, describe, expect, jest, mock, test } from "bun:test";

// Una revocación de token push que falla en el logout deja la fila en
// `device_tokens` viva para siempre: Supabase sigue entregando push a un
// dispositivo sin sesión. Estos casos fijan el contrato del reintento.

const storage = new Map<string, string>();
const deleteDeviceTokens = jest.fn();

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

const { pendingDeviceTokenRevocationRepository } = await import(
	"./pending-revocation"
);

const STORAGE_KEY = "role.pending-device-token-revocation.v1";

describe("revocación de token push pendiente", () => {
	beforeEach(() => {
		storage.clear();
		deleteDeviceTokens.mockReset();
		deleteDeviceTokens.mockResolvedValue(undefined);
	});

	test("conserva el registro cuando la API rechaza la revocación", async () => {
		deleteDeviceTokens.mockRejectedValue(new Error("sin red"));
		await pendingDeviceTokenRevocationRepository.schedule("user-1");

		await expect(
			pendingDeviceTokenRevocationRepository.drain("user-1"),
		).resolves.toBe(false);
		expect(storage.has(STORAGE_KEY)).toBe(true);
		expect(deleteDeviceTokens).toHaveBeenCalledWith("user-1");
	});

	test("un drenado exitoso borra el registro", async () => {
		await pendingDeviceTokenRevocationRepository.schedule("user-1");

		await expect(
			pendingDeviceTokenRevocationRepository.drain("user-1"),
		).resolves.toBe(true);
		expect(storage.has(STORAGE_KEY)).toBe(false);
		expect(deleteDeviceTokens).toHaveBeenCalledTimes(1);
	});

	test("otro usuario no puede drenar la revocación: RLS solo permite los propios", async () => {
		await pendingDeviceTokenRevocationRepository.schedule("user-1");

		await expect(
			pendingDeviceTokenRevocationRepository.drain("user-2"),
		).resolves.toBe(false);
		expect(deleteDeviceTokens).not.toHaveBeenCalled();
		expect(storage.has(STORAGE_KEY)).toBe(true);
	});

	test("sin registro pendiente no toca la API", async () => {
		await expect(
			pendingDeviceTokenRevocationRepository.drain("user-1"),
		).resolves.toBe(false);
		expect(deleteDeviceTokens).not.toHaveBeenCalled();
	});

	test("descarta un payload corrupto en vez de reintentarlo para siempre", async () => {
		storage.set(STORAGE_KEY, "{no-json");

		await expect(
			pendingDeviceTokenRevocationRepository.drain("user-1"),
		).resolves.toBe(false);
		expect(deleteDeviceTokens).not.toHaveBeenCalled();
		expect(storage.has(STORAGE_KEY)).toBe(false);
	});
});
