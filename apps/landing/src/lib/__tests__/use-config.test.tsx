import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";
import { renderHook, waitFor } from "@/test-utils/dom";
import { useConfig, usePlatformStats } from "../use-config";

function stubFetch(map: Record<string, unknown>) {
	globalThis.fetch = (async (input: unknown) => {
		const url = String(input);
		const key = Object.keys(map).find((k) => url.includes(k));
		const body = key ? map[key] : null;
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

function wrapper() {
	const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={qc}>{children}</QueryClientProvider>
	);
}

describe("useConfig", () => {
	test("lee valor con fallback", async () => {
		stubFetch({ "/app-config/public": [{ key: "a", value: "1", value_type: "string" }] });
		const { result } = renderHook(() => useConfig("a", "fb"), { wrapper: wrapper() });
		await waitFor(() => expect(result.current).toBe("1"));
		const { result: r2 } = renderHook(() => useConfig("missing", "fb"), {
			wrapper: wrapper(),
		});
		stubFetch({ "/app-config/public": [] });
		await waitFor(() => expect(r2.current).toBe("fb"));
	});
});

describe("usePlatformStats", () => {
	test("devuelve stats", async () => {
		stubFetch({ "/stats/platform": { users: 10, businesses: 2, meals_saved: 5 } });
		const { result } = renderHook(() => usePlatformStats(), { wrapper: wrapper() });
		await waitFor(() => expect(result.current).toEqual({ users: 10, businesses: 2, meals_saved: 5 }));
	});
});
