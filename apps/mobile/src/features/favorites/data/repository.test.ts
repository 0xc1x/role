import { describe, expect, jest, mock, test, type Mock } from "bun:test";

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

mock.module("@/src/core/supabase/client", () => ({
	supabase: {
		from: jest.fn(),
		rpc: jest.fn(),
	},
}));

// El mock debe registrarse antes de cargar el repositorio para evitar importar el runtime nativo.
const { supabase } = await import("@/src/core/supabase/client");
const { favoritesRepository } =
		await import("@/src/features/favorites/data/repository");

const fromMock = supabase.from as unknown as Mock<
	(...args: never[]) => unknown
>;

/** Cadena PostgREST encadenable (thenable) para el listado paginado. */
function mockChain(result: { data?: unknown; error: unknown }) {
	const calls: Record<string, unknown[][]> = {};
	const chain = {} as Record<string, (...args: unknown[]) => unknown> & {
		then: unknown;
	};
	for (const m of ["eq", "order", "range"]) {
		calls[m] = [];
		chain[m] = (...args: unknown[]) => {
			calls[m]?.push(args);
			return chain;
		};
	}
	chain.then = (onF: unknown, onR: unknown) =>
		Promise.resolve(result).then(
			onF as (value: typeof result) => unknown,
			onR as (reason: unknown) => unknown,
		);
	(fromMock as Mock<(...args: never[]) => unknown>).mockReturnValue({
		select: () => chain,
	});
	return { calls };
}

describe("favoritesRepository paginated listing", () => {
	test("getFavorites pagina con range", async () => {
		const { calls } = mockChain({ data: [], error: null });

		const rows = await favoritesRepository.getFavorites("u1", {
			limit: 20,
			offset: 20,
		});

		expect(rows).toEqual([]);
		expect(calls["eq"]).toContainEqual(["user_id", "u1"]);
    expect(calls["order"]).toContainEqual(["created_at", { ascending: false }]);
		expect(calls["range"]).toContainEqual([20, 39]);
	});

	test("getFavorites sin params no pagina (compatibilidad)", async () => {
		const { calls } = mockChain({ data: [], error: null });

		await favoritesRepository.getFavorites("u1");

		expect(calls["range"]).toEqual([]);
	});
});
