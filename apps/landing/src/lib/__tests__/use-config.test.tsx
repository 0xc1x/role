import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@/test-utils/dom";
import {
	ensurePlatformStats,
	useConfig,
	usePlatformStats,
} from "../use-config";

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
		stubFetch({
			"/app-config/public": [{ key: "a", value: "1", value_type: "string" }],
		});
		const { result } = renderHook(() => useConfig("a", "fb"), {
			wrapper: wrapper(),
		});
		await waitFor(() => expect(result.current).toBe("1"));
		const { result: r2 } = renderHook(() => useConfig("missing", "fb"), {
			wrapper: wrapper(),
		});
		stubFetch({ "/app-config/public": [] });
		await waitFor(() => expect(r2.current).toBe("fb"));
	});
});

describe("usePlatformStats", () => {
	test("devuelve stats y su procedencia", async () => {
		stubFetch({
			"/stats/platform": { users: 10, businesses: 2, meals_saved: 5 },
		});
		const { result } = renderHook(() => usePlatformStats(), {
			wrapper: wrapper(),
		});
		await waitFor(() =>
			expect(result.current).toEqual({
				data: {
					users: 10,
					businesses: 2,
					meals_saved: 5,
				},
				source: "api",
			}),
		);
	});

	test("una petición en curso se reporta como loading, no como fallo", () => {
		// El tercer estado: con solo `api`/`fallback`, cargar se confundía con
		// degradar y un sitio sano con la API lenta quedaba marcado como caída.
		// El gate se suelta al final para no dejar la petición colgada.
		const gate: { release: () => void } = { release: () => {} };
		globalThis.fetch = (async () => {
			await new Promise<void>((resolve) => {
				gate.release = resolve;
			});
			return new Response(
				JSON.stringify({ users: 10, businesses: 2, meals_saved: 5 }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as unknown as typeof fetch;
		const { result } = renderHook(() => usePlatformStats(), {
			wrapper: wrapper(),
		});

		expect(result.current.source).toBe("loading");
		expect(result.current.data).toBeUndefined();
		gate.release();
	});

	test("una API caída se reporta como failed, no como un cero", async () => {
		globalThis.fetch = (async () => {
			throw new Error("sin red");
		}) as unknown as typeof fetch;
		const { result } = renderHook(() => usePlatformStats(), {
			wrapper: wrapper(),
		});
		await waitFor(() => expect(result.current.source).toBe("failed"));
		expect(result.current.data).toBeUndefined();
	});
});

describe("ensurePlatformStats", () => {
	test("el loader distingue la respuesta real de la degradación", async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		stubFetch({
			"/stats/platform": { users: 10, businesses: 2, meals_saved: 5 },
		});
		expect(await ensurePlatformStats(queryClient)).toEqual({
			data: { users: 10, businesses: 2, meals_saved: 5 },
			source: "api",
		});

		const downClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		globalThis.fetch = (async () => {
			throw new Error("sin red");
		}) as unknown as typeof fetch;
		// La degradación no lanza: el render por SEO no puede depender de la API.
		// `failed` y no `loading`: el loader espera, así que el estado intermedio
		// no existe para él y el HTML servido nunca lleva `loading`.
		expect(await ensurePlatformStats(downClient)).toEqual({
			data: undefined,
			source: "failed",
		});
	});
});
