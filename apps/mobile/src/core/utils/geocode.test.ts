import { describe, expect, jest, test } from "bun:test";
import { composeShortAddress, reverseGeocode } from "@/src/core/utils/geocode";

describe("reverseGeocode", () => {
	test("parsea zona y compone dirección corta", async () => {
		const fetchMock = jest.fn(async () => ({
			ok: true,
			json: async () => ({
				display_name: "Avenida Quevedo, Santo Domingo, Ecuador",
				address: {
					road: "Avenida Quevedo",
					suburb: "Urbanización Paz y Miño",
					city: "Santo Domingo",
					state: "Santo Domingo de los Tsáchilas",
					postcode: "230106",
					country: "Ecuador",
				},
			}),
		}));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const r1 = await reverseGeocode({ latitude: -0.21, longitude: -78.49 });
		expect(r1).toEqual({
			displayName: "Avenida Quevedo, Santo Domingo, 230106",
			zone: "Urbanización Paz y Miño",
		});
		const r2 = await reverseGeocode({ latitude: -0.21, longitude: -78.49 });
		expect(r2).toEqual(r1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("sin calle ni ciudad usa el display_name crudo", async () => {
		globalThis.fetch = (async () => ({
			ok: true,
			json: async () => ({
				display_name: "Algún lugar remoto",
				address: {},
			}),
		})) as unknown as typeof fetch;
		await expect(
			reverseGeocode({ latitude: 3.3, longitude: 4.4 }),
		).resolves.toEqual({ displayName: "Algún lugar remoto", zone: null });
	});

	test("error de red → vacío sin lanzar", async () => {
		globalThis.fetch = (async () => {
			throw new Error("offline");
		}) as unknown as typeof fetch;
		await expect(
			reverseGeocode({ latitude: 1.1, longitude: 2.2 }),
		).resolves.toEqual({ displayName: "", zone: null });
	});
});

describe("composeShortAddress", () => {
	test("calle + ciudad + postal, sin provincia ni país", () => {
		expect(
			composeShortAddress({
				street: "Avenida Quevedo",
				city: "Santo Domingo",
				postcode: "230106",
			}),
		).toBe("Avenida Quevedo, Santo Domingo, 230106");
	});

	test("omite partes vacías", () => {
		expect(composeShortAddress({ city: "Quito" })).toBe("Quito");
		expect(composeShortAddress({})).toBe("");
	});
});
