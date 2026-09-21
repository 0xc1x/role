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

mock.module("react-native", () => ({ Platform: { OS: "ios" } }));
mock.module("expo-file-system", () => ({ File: class {} }));
mock.module("@/src/core/supabase/client", () => ({
	supabase: {
		from: jest.fn(),
		rpc: jest.fn(),
	},
}));

// Dynamic imports: static imports evaluate before bare-specifier mocks
// (react-native) apply, which trips the Flow-parser on the real package.
const { supabase } = await import("@/src/core/supabase/client");
const { businessRepository } = await import(
	"@/src/features/business/data/repository"
);

const fromMock = supabase.from as unknown as Mock<
	(...args: never[]) => unknown
>;

/** Cadena PostgREST encadenable (thenable) para listados y head-counts. */
function mockChain(result: {
	data?: unknown;
	count?: number | null;
	error: unknown;
}) {
	const calls: Record<string, unknown[][]> = {};
	const selectArgs: unknown[][] = [];
	const chain = {} as Record<string, (...args: unknown[]) => unknown> & {
		then: unknown;
	};
	for (const m of ["eq", "ilike", "order", "range", "limit", "maybeSingle"]) {
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
		select: (...args: unknown[]) => {
			selectArgs.push(args);
			return chain;
		},
	});
	return { calls, selectArgs };
}

describe("businessRepository paginated listing", () => {
	test("getBusinessReviews pagina con range y sin filtro de oferta", async () => {
		const { calls } = mockChain({ data: [], error: null });

		const rows = await businessRepository.getBusinessReviews("b1", {
			limit: 20,
			offset: 20,
		});

		expect(rows).toEqual([]);
		expect(calls["eq"]).toContainEqual(["business_id", "b1"]);
		expect(calls["order"]).toContainEqual([
			"created_at",
			{ ascending: false },
		]);
		expect(calls["range"]).toContainEqual([20, 39]);
	});

	test("getBusinessReviews filtra por oferta via orders!inner", async () => {
		const { calls, selectArgs } = mockChain({ data: [], error: null });

		await businessRepository.getBusinessReviews("b1", {
			offerId: "of1",
			limit: 3,
			offset: 0,
		});

		expect(String(selectArgs[0]?.[0])).toContain("!inner");
		expect(calls["eq"]).toContainEqual(["orders.offer_id", "of1"]);
		expect(calls["range"]).toContainEqual([0, 2]);
	});

	test("countBusinessReviews devuelve el head-count con head:true", async () => {
		const { selectArgs } = mockChain({ count: 5, error: null });

		const count = await businessRepository.countBusinessReviews("b1", {
			offerId: "of1",
		});

		expect(count).toBe(5);
		expect(selectArgs[0]?.[1]).toEqual({ count: "exact", head: true });
	});

	test("getBusinessOffers aplica sucursal + búsqueda server-side + range", async () => {
		const { calls } = mockChain({ data: [], error: null });

		await businessRepository.getBusinessOffers("b1", {
			locationId: "loc1",
			search: "pan",
			limit: 20,
			offset: 0,
		});

		expect(calls["eq"]).toContainEqual(["business_id", "b1"]);
		expect(calls["eq"]).toContainEqual(["business_location_id", "loc1"]);
		expect(calls["ilike"]).toContainEqual(["title", "%pan%"]);
		expect(calls["range"]).toContainEqual([0, 19]);
	});

	test("countBusinessOffers filtra is_active con head:true", async () => {
		const { calls } = mockChain({ count: 4, error: null });

		const count = await businessRepository.countBusinessOffers("b1", {
			isActive: true,
		});

		expect(count).toBe(4);
		expect(calls["eq"]).toContainEqual(["is_active", true]);
	});

	test("getBusinessOffers filtra categoría server-side con !inner", async () => {
		const { calls, selectArgs } = mockChain({ data: [], error: null });

		await businessRepository.getBusinessOffers("b1", {
			categoryId: "cat-9",
			orderBy: "title",
			ascending: true,
			limit: 20,
			offset: 0,
		});

		expect(String(selectArgs[0]?.[0])).toContain("offer_categories!inner");
		expect(calls["eq"]).toContainEqual([
			"offer_categories.category_id",
			"cat-9",
		]);
		expect(calls["order"]).toContainEqual(["title", { ascending: true }]);
		expect(calls["range"]).toContainEqual([0, 19]);
	});

	test("countBusinessOffers incluye el embed para el filtro de categoría", async () => {
		const { calls, selectArgs } = mockChain({ count: 2, error: null });

		const count = await businessRepository.countBusinessOffers("b1", {
			categoryId: "cat-9",
		});

		expect(count).toBe(2);
		expect(String(selectArgs[0]?.[0])).toContain("offer_categories!inner");
		expect(calls["eq"]).toContainEqual([
			"offer_categories.category_id",
			"cat-9",
		]);
	});

	test("getCoupons filtra is_active y pagina con range", async () => {
		const { calls } = mockChain({ data: [], error: null });

		await businessRepository.getCoupons("b1", {
			isActive: true,
			limit: 20,
			offset: 20,
		});

		expect(calls["eq"]).toContainEqual(["is_active", true]);
		expect(calls["range"]).toContainEqual([20, 39]);
	});

	test("countCoupons devuelve el head-count", async () => {
		mockChain({ count: 2, error: null });

		await expect(businessRepository.countCoupons("b1")).resolves.toBe(2);
	});

	test("getPayouts filtra por status y pagina con range", async () => {
		const { calls } = mockChain({ data: [], error: null });

		await businessRepository.getPayouts("b1", {
			status: "paid",
			limit: 20,
			offset: 0,
		});

		expect(calls["eq"]).toContainEqual(["status", "paid"]);
		expect(calls["order"]).toContainEqual([
			"period_end",
			{ ascending: false },
		]);
		expect(calls["range"]).toContainEqual([0, 19]);
	});

	test("getPayout lee una sola fila por id", async () => {
		mockChain({ data: null, error: null });

		await expect(businessRepository.getPayout("p1")).resolves.toBeNull();
		expect(fromMock).toHaveBeenCalledWith("payouts");
	});

	test("getPayoutTotals suma exacto por estado (sin filtro)", async () => {
		const { calls } = mockChain({
			data: [
				{ net_amount: 100, status: "paid" },
				{ net_amount: 50, status: "paid" },
				{ net_amount: 30, status: "processing" },
				{ net_amount: 10, status: "failed" },
			],
			error: null,
		});

		await expect(businessRepository.getPayoutTotals("b1")).resolves.toEqual({
			paid: 150,
			paidCount: 2,
			pending: 30,
		});
		expect(calls["eq"]).toContainEqual(["business_id", "b1"]);
		expect(calls["limit"]).toContainEqual([1000]);
	});
});
