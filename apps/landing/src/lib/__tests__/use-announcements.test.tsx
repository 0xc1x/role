import { afterEach, describe, expect, test } from "bun:test";
import type { Announcement } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@/test-utils/dom";

import { ensureAnnouncements, useAnnouncements } from "../use-announcements";

// El loader SSR y el hook del cliente son el mismo read path con dos formas de
// fallar. Lo que se afirma acá es la DEGRADACIÓN: la landing no puede dejar de
// pintarse por una API de avisos caída, y al mismo tiempo no puede convertir ese
// fallo en "no hay avisos", porque las dos cosas se ven igual en la pantalla.

const AVISO: Announcement = {
	id: "a0000000-0000-4000-8000-0000000000a1",
	title: "Mantenimiento esta noche",
	body: "El servicio vuelve a las 23:00.",
	severity: "info",
	audience_kind: "all",
	priority: 0,
	active: true,
	start_at: null,
	end_at: null,
	created_at: "2026-10-01T00:00:00.000Z",
	updated_at: "2026-10-01T00:00:00.000Z",
};

const previousFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = previousFetch;
});

function cliente(): QueryClient {
	return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function stubOk(body: unknown) {
	globalThis.fetch = (async (input: unknown) => {
		if (String(input).includes("/announcements")) {
			return new Response(JSON.stringify(body), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}
		return new Response("[]", {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

function stubCaido() {
	globalThis.fetch = (async (input: unknown) => {
		if (String(input).includes("/announcements")) {
			return new Response(JSON.stringify({ message: "caído" }), {
				status: 503,
			});
		}
		return new Response("[]", {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

function wrapper(queryClient: QueryClient) {
	return ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}

describe("ensureAnnouncements", () => {
	test("la respuesta real llega como `api`", async () => {
		stubOk([AVISO]);
		expect(await ensureAnnouncements(cliente())).toEqual({
			data: [AVISO],
			source: "api",
		});
	});

	test("con la API caída degrada a `failed` y NO lanza", async () => {
		stubCaido();
		// El loader espera: no existe `loading` para él, así que el HTML servido
		// nunca lleva ese estado. Y una lista vacía sería mentir — "no tenés
		// avisos" no es "no pudimos preguntar"—, que es justo lo que el servicio
		// de la API evita devolviendo un 500 en vez de `[]`.
		expect(await ensureAnnouncements(cliente())).toEqual({
			data: undefined,
			source: "failed",
		});
	});

	test("una lista vacía de verdad SÍ es `api`, no un fallo", async () => {
		// La distinción que se está defendiendo tiene que cortar en los dos
		// sentidos: si `[]` también fuera `failed`, el atributo del markup no
		// informaría de nada.
		stubOk([]);
		expect(await ensureAnnouncements(cliente())).toEqual({
			data: [],
			source: "api",
		});
	});

	test("una fila fuera del contrato se descarta como `failed`, no como `api`", async () => {
		// `severity: "urgente"` no existe en el enum del SSOT. Un casteo en vez de
		// zod lo dejaría pasar como `api` y la banda lo pintaría.
		stubOk([{ ...AVISO, severity: "urgente" }]);
		expect(await ensureAnnouncements(cliente())).toEqual({
			data: undefined,
			source: "failed",
		});
	});
});

describe("useAnnouncements", () => {
	test("una petición en curso se reporta como `loading`, no como `failed`", () => {
		// Sin el tercer estado, el primer render de una página sana con la API
		// lenta se reportaría como degradación.
		const gate: { release: () => void } = { release: () => {} };
		globalThis.fetch = (async () => {
			await new Promise<void>((resolve) => {
				gate.release = resolve;
			});
			return new Response(JSON.stringify([AVISO]), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const { result } = renderHook(() => useAnnouncements(), {
			wrapper: wrapper(cliente()),
		});

		expect(result.current.source).toBe("loading");
		expect(result.current.data).toBeUndefined();
		gate.release();
	});

	test("con datos es `api` aunque esté revalidando", async () => {
		stubOk([AVISO]);
		const queryClient = cliente();
		const { result } = renderHook(() => useAnnouncements(), {
			wrapper: wrapper(queryClient),
		});

		await waitFor(() => expect(result.current.source).toBe("api"));
		expect(result.current.data).toEqual([AVISO]);
	});

	test("con la API caída es `failed`, y `data` sigue siendo `undefined`", async () => {
		stubCaido();
		const { result } = renderHook(() => useAnnouncements(), {
			wrapper: wrapper(cliente()),
		});

		await waitFor(() => expect(result.current.source).toBe("failed"));
		expect(result.current.data).toBeUndefined();
	});
});
