import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { ordersKeys } from "@/features/orders/queries/orders.keys";
import { cleanup, renderHook } from "@/test-utils/dom";
import { useTransitionOrderStatus } from "../orders.queries";

/**
 * Mover una orden mueve stock y dinero. El resultado tiene que ser visible
 * siempre —incluso el fallo, con su `requestId`—: un 422 mudo deja al operador
 * con la misma pantalla y la misma orden atascada, sin forma de escalarlo.
 */

const previousFetch = globalThis.fetch;

function stubFetch(status: number, body: unknown) {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		})) as unknown as typeof fetch;
}

function renderMutation<T>(hook: () => T) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return { ...renderHook(hook, { wrapper }), queryClient };
}

afterEach(() => {
	cleanup();
	// `mock.restore()` y no un restore por test: el spy de `invalidateQueries`
	// vive en el prototipo de QueryClient, así que sin restaurarlo contaminaría
	// los conteos de cualquier spec de mutación que corra después.
	mock.restore();
	globalThis.fetch = previousFetch;
});

describe("useTransitionOrderStatus", () => {
	test("confirma el estado nuevo al que se movió la orden", async () => {
		stubFetch(200, { id: "orden-1", status: "cancelled" });
		const success = spyOn(toast, "success");
		const { result } = renderMutation(() => useTransitionOrderStatus());

		await result.current.mutateAsync({ id: "orden-1", status: "cancelled" });

		expect(success).toHaveBeenCalledWith("Orden movida a Cancelada");
	});

	// La insignia de atascada, el filtro «solo atascadas» y los totales se
	// calculan en el servidor. Sin invalidar el listado, la orden que se acaba
	// de desbloquear seguiría apareciendo como atascada.
	test("invalida el listado para que el filtro de atascadas se refresque", async () => {
		stubFetch(200, { id: "orden-1", status: "expired" });
		const invalidate = spyOn(QueryClient.prototype, "invalidateQueries");
		const { result } = renderMutation(() => useTransitionOrderStatus());

		await result.current.mutateAsync({ id: "orden-1", status: "expired" });

		expect(invalidate).toHaveBeenCalledWith({
			queryKey: ordersKeys.lists(),
		});
	});

	// El `requestId` es lo único que correlaciona el toast del operador con el
	// log del servidor; sin él, una transición de stock fallida no se puede
	// escalar.
	test("un fallo muestra el mensaje y el requestId de la API", async () => {
		stubFetch(422, {
			statusCode: 422,
			message: "Cannot transition order from 'cancelled' to 'confirmed'",
			requestId: "req_order_9f2c",
		});
		const error = spyOn(toast, "error");
		const success = spyOn(toast, "success");
		const { result } = renderMutation(() => useTransitionOrderStatus());

		await result.current
			.mutateAsync({ id: "orden-1", status: "confirmed" })
			.catch(() => undefined);

		expect(error).toHaveBeenCalledTimes(1);
		const message = String(error.mock.calls[0]?.[0]);
		expect(message).toContain("req_order_9f2c");
		expect(message).toContain("Cannot transition order");
		expect(success).not.toHaveBeenCalled();
	});
});
