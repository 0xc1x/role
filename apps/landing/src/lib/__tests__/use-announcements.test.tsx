import { afterEach, describe, expect, test } from "bun:test";
import type { Announcement } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@/test-utils/dom";

import {
	type AnnouncementsResult,
	ensureAnnouncements,
	useAnnouncements,
} from "../use-announcements";

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

/** El valor que el loader de la ruta entrega al hook. */
const SIN_AVISOS: AnnouncementsResult = { data: undefined, source: "failed" };

const previousFetch = globalThis.fetch;

// El `cleanup()` va ACÁ también, y no solo en el spec del componente, aunque
// este archivo no afirme nada sobre el DOM. `renderHook` monta un container real
// en `document.body` en cada `renderHook`, y sin cleanup se acumulan: hoy es
// inofensivo porque ninguna aserción de este archivo mira el documento, pero la
// regla que el otro spec declara —"toda spec que monta algo limpia lo que
// montó"— no puede ser cierta en un archivo y falsa en el de al lado.
//
// (`use-config.test.tsx` tiene la misma omisión en sus cinco `renderHook`, y es
// preexistente: se anota en el reporte y no se toca acá.)
afterEach(() => {
	cleanup();
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

describe("useAnnouncements: qué contesta el loader y qué contesta el observer", () => {
	// El hook ya no puede publicarse sin el valor del loader: un
	// `useQuery(announcementsQueryOptions)` solo devuelve su resultado OPTIMISTA
	// en el render del servidor, que es `pending` siempre que no haya `data`.
	// Estos tres tests fijan la regla del merge, y los tres casos son los que la
	// tabla del docblock promises.
	test("mientras el observer no tiene respuesta, contesta el loader", () => {
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

		const servidos: AnnouncementsResult = {
			data: [AVISO],
			source: "api",
		};
		const { result } = renderHook(() => useAnnouncements(servidos), {
			wrapper: wrapper(cliente()),
		});

		// El observer está en vuelo y todavía no sabe nada: lo que se publica es
		// lo que el loader ya sabía, avisos incluidos. Sin esto, el aviso
		// desaparecería un frame en cada carga del cliente.
		expect(result.current).toEqual(servidos);
		gate.release();
	});

	test("en cuanto el observer responde, contesta el observer", async () => {
		stubOk([AVISO]);
		const { result } = renderHook(() => useAnnouncements(SIN_AVISOS), {
			wrapper: wrapper(cliente()),
		});

		// El loader decía `failed` y la API répondió: el valor más nuevo es el del
		// observer. Al revés —que el loader tapara siempre— un fallo de red
		// posterior al render no se publicaría nunca.
		await waitFor(() => expect(result.current.source).toBe("api"));
		expect(result.current.data).toEqual([AVISO]);
	});

	test("un fallo del observer tapa al loader", async () => {
		stubCaido();
		const servidos: AnnouncementsResult = { data: [AVISO], source: "api" };
		const { result } = renderHook(() => useAnnouncements(servidos), {
			wrapper: wrapper(cliente()),
		});

		await waitFor(() => expect(result.current.source).toBe("failed"));
		expect(result.current.data).toBeUndefined();
	});

	test("el tercer estado sigue siendo `loading`, no `failed`, mientras vuela", () => {
		// El nombre del estado intermedio existe para esto: una página sana con la
		// API lenta no puede reportarse como degradación. El valor que se publica
		// en ese instante es el del loader, pero el observer sigue distinguiendo
		// "todavía no" de "no va a venir", y esa distinción es la que decide cuándo
		// deja de hablar el loader.
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

		const enVuelo: AnnouncementsResult = {
			data: undefined,
			source: "loading",
		};
		const { result } = renderHook(() => useAnnouncements(enVuelo), {
			wrapper: wrapper(cliente()),
		});

		expect(result.current).toEqual(enVuelo);
		gate.release();
	});
});
