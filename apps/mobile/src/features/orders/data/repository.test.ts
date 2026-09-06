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

mock.module("@/core/supabase/client", () => ({
	supabase: {
		from: jest.fn(),
		rpc: jest.fn(),
	},
}));

import { supabase } from "@/core/supabase/client";
import { orderRepository } from "@/features/orders/data/repository";

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

	test("updateOrderStatus hace UPDATE directo (solo transiciones operativas)", async () => {
		const eqMock = jest.fn(async () => ({ error: null }));
		const updateMock = jest.fn(() => ({ eq: eqMock }));
		fromMock.mockReturnValue({ update: updateMock });

		await orderRepository.updateOrderStatus("order-1", "ready_for_pickup");

		expect(fromMock).toHaveBeenCalledWith("orders");
		expect(updateMock).toHaveBeenCalledWith({ status: "ready_for_pickup" });
		expect(eqMock).toHaveBeenCalledWith("id", "order-1");
	});
});
