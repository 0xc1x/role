import { beforeEach, describe, expect, it, jest } from "bun:test";
import { apiGet } from "../api";

const originalFetch = globalThis.fetch;

function stubFetch(impl: typeof globalThis.fetch) {
	globalThis.fetch = impl;
}

function unstubFetch() {
	globalThis.fetch = originalFetch;
}

describe("apiGet", () => {
	beforeEach(() => unstubFetch());

	it("returns json on ok", async () => {
		stubFetch(
			jest.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ data: 1 }),
			}) as unknown as typeof globalThis.fetch,
		);
		await expect(apiGet("/stats/platform")).resolves.toEqual({ data: 1 });
	});

	it("throws on non-ok", async () => {
		stubFetch(
			jest.fn().mockResolvedValue({
				ok: false,
				status: 500,
			}) as unknown as typeof globalThis.fetch,
		);
		await expect(apiGet("/fail")).rejects.toThrow("respondió 500");
	});
});
