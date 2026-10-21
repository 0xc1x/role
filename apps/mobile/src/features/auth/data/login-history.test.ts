import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	mock,
	test,
} from "bun:test";

/**
 * El login recuerda el identificador con el que se entró (§9.1 del diseño de
 * accesos de staff), pero el PIN NUNCA se guarda: el registro local lleva sólo
 * identificadores, y eso es lo que estos casos sostienen.
 */

const storage = new Map<string, string>();

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

const { readLoginIdentifiers, rememberLoginIdentifier, clearLoginIdentifiers } =
	await import("./login-history");

const STORAGE_KEY = "role.login.identifiers";

const originalWarn = console.warn;
/** El `console.warn` se intercepta: el fallo esperado no puede ensuciar la salida. */
const warnMock = jest.fn();

beforeEach(() => {
	storage.clear();
	warnMock.mockClear();
	console.warn = warnMock as unknown as typeof console.warn;
});

afterEach(() => {
	console.warn = originalWarn;
});

describe("identificadores de acceso de este dispositivo", () => {
	test("guarda como máximo los tres últimos, del más reciente al más viejo", async () => {
		await rememberLoginIdentifier("uno@dominio.com");
		await rememberLoginIdentifier("dos@dominio.com");
		await rememberLoginIdentifier("tres@dominio.com");
		await rememberLoginIdentifier("cuatro@dominio.com");

		expect(await readLoginIdentifiers()).toEqual([
			"cuatro@dominio.com",
			"tres@dominio.com",
			"dos@dominio.com",
		]);
	});

	test("el mismo identificador no se repite sin distinguir mayúsculas", async () => {
		await rememberLoginIdentifier("ana@x.com");
		await rememberLoginIdentifier("Ana@X.com");

		// La escritura nueva reemplaza a la vieja: un alias con otra caja es el
		// MISMO acceso (la unicidad de la base es sobre `lower(alias)`).
		expect(await readLoginIdentifiers()).toEqual(["Ana@X.com"]);
	});

	test("un JSON corrupto devuelve una lista vacía en vez de lanzar", async () => {
		storage.set(STORAGE_KEY, "{no-json");

		expect(await readLoginIdentifiers()).toEqual([]);
	});

	test("el registro sólo guarda identificadores: ningún PIN", async () => {
		await rememberLoginIdentifier("cajero@mibarrio.role.ec");

		const raw = storage.get(STORAGE_KEY);
		expect(raw).toBeString();
		const record = JSON.parse(raw ?? "{}") as Record<string, unknown>;

		// La promesa del §9.1, sostenida por una aserción sobre las claves: el
		// registro no tiene ningún campo de PIN ni de contraseña.
		expect(Object.keys(record)).toEqual(["identifiers"]);
		expect(record.identifiers).toEqual(["cajero@mibarrio.role.ec"]);
	});

	test("un fallo del almacenamiento no rompe el login", async () => {
		const storageModule = await import(
			"@react-native-async-storage/async-storage"
		);
		const setItem = storageModule.default.setItem as unknown as jest.Mock;
		setItem.mockImplementationOnce(async () => {
			throw new Error("disco lleno");
		});

		await expect(
			rememberLoginIdentifier("cajero@mibarrio.role.ec"),
		).resolves.toBe(undefined);
		expect(warnMock).toHaveBeenCalled();
		expect(warnMock.mock.calls[0]?.[0]).toBe(
			"login_identifier_remember_failed",
		);
	});

	test("borrar el registro deja la lista vacía", async () => {
		await rememberLoginIdentifier("cajero@mibarrio.role.ec");

		await clearLoginIdentifiers();

		expect(await readLoginIdentifiers()).toEqual([]);
	});
});
