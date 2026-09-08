import { describe, expect, jest, mock, type Mock, test } from "bun:test";

// El módulo real de supabase arranca timers que tocan window.localStorage.
const memstore = new Map<string, string>();
const g = globalThis as Record<string, unknown>;
g.window ??= {
	localStorage: {
		getItem: (k: string) => memstore.get(k) ?? null,
		setItem: (k: string, v: string) => void memstore.set(k, v),
		removeItem: (k: string) => void memstore.delete(k),
	},
};

mock.module("@/core/supabase/client", () => ({
	supabase: {
		from: jest.fn(),
	},
}));

import { supabase } from "@/core/supabase/client";
import { fetchAppConfig } from "@/features/config/data/repository";
import { AppError } from "@/core/error/app-error";

describe("fetchAppConfig", () => {
	test("mapea filas a mapa", async () => {
		const eq2 = jest.fn(async () => ({
			data: [{ key: "a", value: 1 }],
			error: null,
		}));
		const eq1 = jest.fn(() => ({ eq: eq2 }));
		(supabase.from as unknown as Mock<(...args: never[]) => unknown>).mockReturnValue({
			select: jest.fn(() => ({ eq: eq1 })),
		});
		await expect(fetchAppConfig()).resolves.toEqual({ a: 1 });
	});

	test("propaga error de supabase como AppError", async () => {
		const eq2 = jest.fn(async () => ({ data: null, error: { message: "boom" } }));
		const eq1 = jest.fn(() => ({ eq: eq2 }));
		(supabase.from as unknown as Mock<(...args: never[]) => unknown>).mockReturnValue({
			select: jest.fn(() => ({ eq: eq1 })),
		});
		const err = await fetchAppConfig().then(
			() => null,
			(e: unknown) => e,
		);
		expect(err).toBeInstanceOf(AppError);
		expect((err as AppError).kind).toBe("unknown");
	});
});
