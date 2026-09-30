import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { cleanup, renderHook, waitFor } from "@/test-utils/dom";
import { businessesKeys } from "../businesses.keys";
import { useVerifyBusiness } from "../businesses.queries";

const previousFetch = globalThis.fetch;

const listKeyParams = { page: 1, limit: 10 };

function setup() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	// Lista sembrada: sin observador activo, invalidar no dispara refetch.
	queryClient.setQueryData(businessesKeys.list(listKeyParams), {
		data: [],
		meta: { page: 1, limit: 10, total: 0 },
	});
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return { queryClient, ...renderHook(() => useVerifyBusiness(), { wrapper }) };
}

function stubFetch(status: number, body: unknown) {
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		})) as unknown as typeof fetch;
}

const approvedBusiness = {
	id: "biz-1",
	name: "Café Central",
	verification_status: "approved",
};

afterEach(() => {
	cleanup();
	mock.restore();
	globalThis.fetch = previousFetch;
});

describe("useVerifyBusiness", () => {
	test("invalida la lista de negocios al aprobar", async () => {
		stubFetch(200, approvedBusiness);
		const success = spyOn(toast, "success");
		const { queryClient, result } = setup();

		await result.current.mutateAsync({
			id: "biz-1",
			verification_status: "approved",
		});

		expect(
			queryClient.getQueryState(businessesKeys.list(listKeyParams))
				?.isInvalidated,
		).toBe(true);
		expect(success).toHaveBeenCalledTimes(1);
	});

	test("invalida la lista al rechazar y avisa del correo", async () => {
		stubFetch(200, { ...approvedBusiness, verification_status: "rejected" });
		const success = spyOn(toast, "success");
		const { queryClient, result } = setup();

		await result.current.mutateAsync({
			id: "biz-1",
			verification_status: "rejected",
			rejection_reason: "Documentos ilegibles",
		});

		expect(
			queryClient.getQueryState(businessesKeys.list(listKeyParams))
				?.isInvalidated,
		).toBe(true);
		expect(success).toHaveBeenCalledTimes(1);
	});

	test("muestra el error de la API y no invalida la lista", async () => {
		stubFetch(403, { statusCode: 403, message: "Forbidden resource" });
		const error = spyOn(toast, "error");
		const success = spyOn(toast, "success");
		const { queryClient, result } = setup();

		await result.current
			.mutateAsync({ id: "biz-1", verification_status: "approved" })
			.catch(() => undefined);

		expect(error).toHaveBeenCalledWith("Forbidden resource");
		expect(success).not.toHaveBeenCalled();
		expect(
			queryClient.getQueryState(businessesKeys.list(listKeyParams))
				?.isInvalidated,
		).toBeFalsy();
	});

	test("expone isPending mientras la verificación está en vuelo", async () => {
		let release: () => void = () => {};
		globalThis.fetch = (async () => {
			await new Promise<void>((resolve) => {
				release = resolve;
			});
			return new Response(JSON.stringify(approvedBusiness), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;
		const { result } = setup();

		expect(result.current.isPending).toBe(false);
		const pending = result.current.mutateAsync({
			id: "biz-1",
			verification_status: "approved",
		});
		await waitFor(() => expect(result.current.isPending).toBe(true));
		release();
		await pending;
		await waitFor(() => expect(result.current.isPending).toBe(false));
	});
});
