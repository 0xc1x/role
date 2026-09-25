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
		auth: {
			getUser: async () => ({ data: { user: { id: "u1" } } }),
		},
	},
}));

// El mock debe registrarse antes de cargar el repositorio para evitar importar el runtime nativo.
const { supabase } = await import("@/src/core/supabase/client");
const { createReservationIdempotencyKey, orderRepository } = await import(
	"@/src/features/orders/data/repository"
);

const rpcMock = supabase.rpc as unknown as Mock<
	(...args: never[]) => Promise<{ data: unknown; error: unknown }>
>;
const fromMock = supabase.from as unknown as Mock<
	(...args: never[]) => unknown
>;

function rpcOk(data: unknown) {
	rpcMock.mockImplementation(async () => ({ data, error: null }));
}

describe("orderRepository", () => {
	test("genera claves de idempotencia únicas y acotadas", () => {
		const first = createReservationIdempotencyKey();
		const second = createReservationIdempotencyKey();

		expect(first).not.toBe(second);
		expect(first.length).toBeGreaterThan(0);
		expect(first.length).toBeLessThanOrEqual(128);
	});

	test("reserveOffer conserva la frontera RPC reserve_offer", async () => {
		rpcOk({
			success: true,
			order_id: "order-1",
			order_number: "000001",
			pickup_code: "123456",
			price: 4.5,
			original_price: 6,
			discount: 1.5,
		});

		const result = await orderRepository.reserveOffer(
			"offer-1",
			"coupon-1",
			"reservation-replay-key",
		);

		expect(rpcMock).toHaveBeenCalledWith("reserve_offer", {
			p_user_id: "u1",
			p_offer_id: "offer-1",
			p_coupon_id: "coupon-1",
			p_idempotency_key: "reservation-replay-key",
		});
		expect(result).toMatchObject({
			ok: true,
			orderId: "order-1",
			orderNumber: "000001",
			pickupCode: "123456",
		});
	});

	test("cancelOrderForBusiness llama cancel_order con p_business_id", async () => {
		rpcOk({ success: true, order_id: "order-1", status: "cancelled" });

		const result = await orderRepository.cancelOrderForBusiness(
			"order-1",
			"biz-1",
		);

		expect(rpcMock).toHaveBeenCalledWith("cancel_order", {
			p_order_id: "order-1",
			p_business_id: "biz-1",
		});
		expect(result.success).toBe(true);
		expect(result.orderId).toBe("order-1");
	});

	test("mapea el fallo de negocio del RPC sin lanzar (CANNOT_CANCEL)", async () => {
		rpcOk({
			success: false,
			error: "CANNOT_CANCEL",
			message: "Este pedido no se puede cancelar",
		});

		const result = await orderRepository.cancelOrderForBusiness(
			"order-2",
			"biz-1",
		);

		expect(result).toEqual({
			success: false,
			errorCode: "CANNOT_CANCEL",
			message: "Este pedido no se puede cancelar",
		});
	});

	test("propaga errores de red/postgrest via toAppError", async () => {
		rpcMock.mockImplementation(async () => ({
			data: null,
			error: { code: "XX000", message: "boom" },
		}));

		await expect(
			orderRepository.cancelOrderForBusiness("order-3", "biz-1"),
		).rejects.toThrow("boom");
	});

	test("updateOrderStatus llama set_order_status (matriz server-side)", async () => {
		rpcOk({ success: true, order_id: "order-1", status: "ready_for_pickup" });

		await orderRepository.updateOrderStatus("order-1", "ready_for_pickup");

		expect(rpcMock).toHaveBeenCalledWith("set_order_status", {
			p_order_id: "order-1",
			p_status: "ready_for_pickup",
		});
	});

	test("updateOrderStatus lanza businessRule con el mensaje del RPC", async () => {
		rpcOk({
			success: false,
			error: "INVALID_TRANSITION",
			message: "Transición de estado no permitida",
		});

		await expect(
			orderRepository.updateOrderStatus("order-1", "completed"),
		).rejects.toThrow("Transición de estado no permitida");
	});
});

/** Cadena PostgREST encadenable (thenable) para los listados paginados. */
function mockOrderChain(result: {
	data?: unknown;
	count?: number | null;
	error: unknown;
}) {
	const calls: Record<string, unknown[][]> = {};
	const selectArgs: unknown[][] = [];
	const chain = {} as Record<string, (...args: unknown[]) => unknown> & {
		then: unknown;
	};
	for (const m of ["eq", "in", "gte", "lte", "or", "order", "range"]) {
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

describe("orderRepository paginated listing", () => {
	test("getUserOrders filtra por tab (statuses) y pagina con range", async () => {
		const { calls } = mockOrderChain({ data: [], error: null });

		const rows = await orderRepository.getUserOrders("u1", {
			statuses: ["pending", "confirmed"],
			limit: 20,
			offset: 20,
		});

		expect(rows).toEqual([]);
		expect(calls["eq"]).toContainEqual(["user_id", "u1"]);
		expect(calls["in"]).toContainEqual(["status", ["pending", "confirmed"]]);
		expect(calls["range"]).toContainEqual([20, 39]);
	});

	test("getUserOrders aplica filtros server-side + range", async () => {
		const { calls } = mockOrderChain({ data: [], error: null });

		await orderRepository.getUserOrders("u1", {
			statuses: ["pending"],
			from: "2026-09-01T00:00:00.000Z",
			to: "2026-09-08T00:00:00.000Z",
			search: "aurora",
			limit: 20,
			offset: 0,
		});

		expect(calls["eq"]).toContainEqual(["user_id", "u1"]);
		expect(calls["in"]).toContainEqual(["status", ["pending"]]);
		expect(calls["gte"]).toContainEqual([
			"created_at",
			"2026-09-01T00:00:00.000Z",
		]);
		expect(calls["lte"]).toContainEqual([
			"created_at",
			"2026-09-08T00:00:00.000Z",
		]);
		const orArg = calls["or"]?.[0]?.[0];
		expect(typeof orArg).toBe("string");
		expect(orArg as string).toContain("order_number.ilike.");
		expect(orArg as string).toContain("aurora");
		expect(calls["order"]).toContainEqual(["created_at", { ascending: false }]);
		expect(calls["range"]).toContainEqual([0, 19]);
	});

	test("getUserOrders aplica status/branch/sort server-side", async () => {
		const { calls } = mockOrderChain({ data: [], error: null });

		await orderRepository.getBusinessOrders("b1", {
			status: "confirmed",
			branchId: "loc1",
			ascending: true,
			limit: 20,
			offset: 20,
		});

		expect(calls["eq"]).toContainEqual(["business_id", "b1"]);
		expect(calls["eq"]).toContainEqual(["status", "confirmed"]);
		expect(calls["eq"]).toContainEqual(["offers.business_location_id", "loc1"]);
		expect(calls["order"]).toContainEqual(["created_at", { ascending: true }]);
		expect(calls["range"]).toContainEqual([20, 39]);
	});

	test("getBusinessOrders mapea filas con ORDER_SELECT", async () => {
		mockOrderChain({
			data: [
				{
					id: "o1",
					user_id: "u1",
					offer_id: "of1",
					business_id: "b1",
					order_number: "000042",
					status: "pending",
					price: 50,
					original_price: 100,
					pickup_code: "123456",
					pickup_time: null,
					coupon_id: null,
					created_at: "2026-09-01T10:00:00.000Z",
					offers: null,
					businesses: null,
					profiles: null,
					order_events: null,
				},
			],
			error: null,
		});

		const rows = await orderRepository.getBusinessOrders("b1", { limit: 20 });

		expect(rows).toHaveLength(1);
		expect(rows[0]?.order.id).toBe("o1");
		expect(rows[0]?.businessName).toBe("Negocio");
	});

	test("countUserOrders devuelve el head-count con head:true", async () => {
		const { selectArgs } = mockOrderChain({ count: 7, error: null });

		const count = await orderRepository.countUserOrders("u1", {
			statuses: ["completed"],
		});

		expect(count).toBe(7);
		expect(selectArgs[0]?.[1]).toEqual({ count: "exact", head: true });
	});

	test("counts incluyen embeds !inner para que los filtros join resuelvan", async () => {
		const { calls, selectArgs } = mockOrderChain({ count: 3, error: null });

		const count = await orderRepository.countUserOrders("u1", {
			statuses: ["pending"],
			search: "aurora",
		});

		expect(count).toBe(3);
		expect(String(selectArgs[0]?.[0])).toContain("offers!inner");
		expect(String(selectArgs[0]?.[0])).toContain("businesses!inner");
		const orArg = calls["or"]?.[0]?.[0];
		expect(typeof orArg).toBe("string");
		expect(orArg as string).toContain("offers.title.ilike.");
	});

	test("countBusinessOrders aplica branchId sobre el embed de ofertas", async () => {
		const { calls } = mockOrderChain({ count: 2, error: null });

		await orderRepository.countBusinessOrders("b1", { branchId: "loc1" });

		expect(calls["eq"]).toContainEqual(["business_id", "b1"]);
		expect(calls["eq"]).toContainEqual(["offers.business_location_id", "loc1"]);
	});

	test("countBusinessOrders propaga errores via toAppError", async () => {
		mockOrderChain({
			count: null,
			error: { code: "XX000", message: "boom" },
		});

		await expect(orderRepository.countBusinessOrders("b1")).rejects.toThrow(
			"boom",
		);
	});

	test("getMyReviews pagina con range", async () => {
		const { calls } = mockOrderChain({ data: [], error: null });

		const rows = await orderRepository.getMyReviews({
			limit: 20,
			offset: 40,
		});

		expect(rows).toEqual([]);
		expect(calls["order"]).toContainEqual(["created_at", { ascending: false }]);
		expect(calls["range"]).toContainEqual([40, 59]);
	});
});
