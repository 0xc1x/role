import { describe, expect, jest, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { renderHook, waitFor } from "@/test-utils/dom";
import {
	createListOptions,
	createUseCreate,
	createUseDelete,
	createUseUpdate,
} from "../resource-helpers";

function provider() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return {
		qc,
		wrapper: ({ children }: { children: React.ReactNode }) => (
			<QueryClientProvider client={qc}>{children}</QueryClientProvider>
		),
	};
}

describe("createListOptions", () => {
	test("arma queryOptions con key y queryFn", async () => {
		const apiList = jest.fn(async () => ({ data: [1] }));
		const opts = createListOptions<{ q?: string }, { data: number[] }>(
			{ list: (p) => ["x", "list", p ?? {}] },
			apiList,
		)({ q: "a" });
		expect([...opts.queryKey]).toEqual(["x", "list", { q: "a" }]);
		if (!opts.queryFn) throw new Error("sin queryFn");
		await expect(opts.queryFn({} as never)).resolves.toEqual({ data: [1] });
		expect(apiList).toHaveBeenCalledWith({ q: "a" });
	});
});

describe("mutation helpers", () => {
	test("create invalida lista al éxito", async () => {
		const apiCreate = jest.fn(async (b: { n: string }) => ({ id: "1", ...b }));
		const { wrapper, qc } = provider();
		const useCreate = createUseCreate(
			{ all: ["x"], lists: () => ["x", "list"] },
			apiCreate,
		);
		const { result } = renderHook(() => useCreate(), { wrapper });
		await act(async () => {
			await result.current.mutateAsync({ n: "a" });
		});
		expect(apiCreate).toHaveBeenCalledWith({ n: "a" });
		expect(qc.getMutationCache().getAll()).toHaveLength(1);
	});

	test("update setea detalle", async () => {
		const apiUpdate = jest.fn(async (id: string, b: { n: string }) => ({
			id,
			...b,
		}));
		const { wrapper, qc } = provider();
		const useUpdate = createUseUpdate(
			{
				all: ["x"],
				lists: () => ["x", "list"],
				detail: (id: string) => ["x", "detail", id],
			},
			apiUpdate,
		);
		const { result } = renderHook(() => useUpdate(), { wrapper });
		await act(async () => {
			await result.current.mutateAsync({ id: "9", body: { n: "b" } });
		});
		expect(
			qc.getQueryData<{ id: string; n: string }>(["x", "detail", "9"]),
		).toEqual({
			id: "9",
			n: "b",
		});
	});

	test("delete llama al api", async () => {
		const apiRemove = jest.fn(async () => ({}));
		const { wrapper } = provider();
		const useDelete = createUseDelete({ all: ["x"] }, apiRemove);
		const { result } = renderHook(() => useDelete(), { wrapper });
		await act(async () => {
			await result.current.mutateAsync("7");
		});
		expect(apiRemove).toHaveBeenCalledWith("7");
		await waitFor(() => expect(apiRemove).toHaveBeenCalledTimes(1));
	});
});
