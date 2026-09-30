import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { cleanup, renderHook } from "@/test-utils/dom";
import { useGeneratePayouts, useMarkPaid } from "../payouts.queries";

/**
 * A7: generar cortes y marcar pagos son acciones de dinero. El resultado tiene que
 * ser visible siempre: cuántos cortes se crearon, o que falló. El silencio aquí
 * es indistinguishable de "no pasó nada".
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
	return renderHook(hook, { wrapper });
}

afterEach(() => {
	cleanup();
	mock.restore();
	globalThis.fetch = previousFetch;
});

describe("useGeneratePayouts", () => {
	test("informa cuántos cortes se generaron", async () => {
		stubFetch(200, { count: 12 });
		const success = spyOn(toast, "success");
		const error = spyOn(toast, "error");
		const { result } = renderMutation(() => useGeneratePayouts());

		await result.current.mutateAsync();

		expect(success).toHaveBeenCalledTimes(1);
		expect(String(success.mock.calls[0]?.[0])).toContain("12");
		expect(error).not.toHaveBeenCalled();
	});

	// Un 0 silencioso se lee como "no había nada que generar" sin confirmar que
	// sea cierto: el corte podría haber fallado por una orden corrupta.
	test("un conteo 0 dice que no había cortes nuevos, no que no pasó nada", async () => {
		stubFetch(200, { count: 0 });
		const success = spyOn(toast, "success");
		const { result } = renderMutation(() => useGeneratePayouts());

		await result.current.mutateAsync();

		expect(String(success.mock.calls[0]?.[0])).toContain(
			"No se generaron cortes nuevos",
		);
	});

	test("un fallo dice que falló y no aparece como éxito", async () => {
		stubFetch(500, { statusCode: 500, message: "Internal server error" });
		const success = spyOn(toast, "success");
		const error = spyOn(toast, "error");
		const { result } = renderMutation(() => useGeneratePayouts());

		await result.current.mutateAsync().catch(() => undefined);

		expect(error).toHaveBeenCalledWith("Error interno del servidor");
		expect(success).not.toHaveBeenCalled();
	});
});

describe("useMarkPaid", () => {
	test("confirma el corte liquidado", async () => {
		stubFetch(200, { id: "payout-1", status: "paid" });
		const success = spyOn(toast, "success");
		const { result } = renderMutation(() => useMarkPaid());

		await result.current.mutateAsync("payout-1");

		expect(success).toHaveBeenCalledWith("Corte marcado como pagado");
	});

	// El pago se hizo por fuera: un 500 silencioso deja al operador pensando que
	// todo salió bien mientras el corte sigue pendiente. Un mensaje que la capa de
	// traducción no conoce se muestra tal cual (decisión de diseño: no se pierde
	// el diagnóstico del servidor detrás de un texto genérico).
	test("un fallo de pago se muestra al operador", async () => {
		stubFetch(409, {
			statusCode: 409,
			message: "Payout already paid",
		});
		const error = spyOn(toast, "error");
		const success = spyOn(toast, "success");
		const { result } = renderMutation(() => useMarkPaid());

		await result.current.mutateAsync("payout-1").catch(() => undefined);

		expect(error).toHaveBeenCalledWith("Payout already paid");
		expect(success).not.toHaveBeenCalled();
	});
});
