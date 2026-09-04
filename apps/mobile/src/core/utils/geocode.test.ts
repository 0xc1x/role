import { describe, expect, jest, test } from "bun:test";
import { reverseGeocode } from "@/core/utils/geocode";

describe("reverseGeocode", () => {
	test("parsea zona y cachea", async () => {
		const fetchMock = jest.fn(async () => ({
			ok: true,
			json: async () => ({
				display_name: "Calle 123, Quito",
				address: { suburb: "La Floresta", city: "Quito" },
			}),
		}));
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const r1 = await reverseGeocode({ latitude: -0.21, longitude: -78.49 });
		expect(r1).toEqual({ displayName: "Calle 123, Quito", zone: "La Floresta" });
		const r2 = await reverseGeocode({ latitude: -0.21, longitude: -78.49 });
		expect(r2).toEqual(r1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
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
