import { afterEach, describe, expect, test } from "bun:test";
import type { BusinessDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { BusinessesBulkActions } from "../businesses-bulk-actions";

const previousFetch = globalThis.fetch;

function business(id: string, name: string): BusinessDto {
	return {
		id,
		owner_id: "22222222-2222-4222-8222-222222222222",
		name,
		type: "restaurant",
		slug: id,
		image: null,
		cover_image: null,
		rating: null,
		review_count: null,
		description: null,
		phone: null,
		email: `${id}@example.ec`,
		website: null,
		commission_rate: null,
		balance: null,
		is_active: true,
		verification_status: "pending",
		verified_at: null,
		verified_by: null,
		rejection_reason: null,
		created_at: "2026-09-01T10:00:00.000Z",
		updated_at: "2026-09-01T10:00:00.000Z",
	};
}

const cafe = business("b-cafe", "Café Central");
const panaderia = business("b-panaderia", "Panadería La Espiga");
const mercado = business("b-mercado", "Mercado Central");

interface FetchCall {
	url: string;
	body: unknown;
}

/** `PATCH /businesses/:id` a 200, salvo las filas que el test marca como fallo. */
function stubFetch(
	failing: Record<string, { message: string; requestId: string }>,
) {
	const calls: FetchCall[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ url, body });
		const id = url.split("/").pop() ?? "";
		const failure = failing[id];
		if (failure) {
			return new Response(
				JSON.stringify({
					message: failure.message,
					requestId: failure.requestId,
				}),
				{ status: 409, headers: { "Content-Type": "application/json" } },
			);
		}
		return new Response(JSON.stringify({ id, ...(body ?? {}) }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as typeof globalThis.fetch;
	return calls;
}

function renderBulk(rows: BusinessDto[], onClear = () => undefined) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BusinessesBulkActions selectedRows={rows} onClear={onClear} />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("acciones en lote de negocios", () => {
	// "8 de 12" sin decir cuáles es un resultado que no se puede reintentar ni
	// conciliar. Cada fallo tiene que nombrarse y traer su `requestId`.
	test("un fallo parcial nombra los negocios que fallaron y su requestId", async () => {
		const calls = stubFetch({
			"b-panaderia": {
				message: "El negocio ya fue verificado",
				requestId: "req_panaderia_01",
			},
		});
		renderBulk([cafe, panaderia, mercado]);

		fireEvent.click(screen.getByRole("button", { name: /Aprobar/ }));

		await waitFor(() =>
			expect(screen.getByText("Resultado del lote")).toBeTruthy(),
		);
		expect(calls).toHaveLength(3);
		// Los dos que salieron bien y el que no: el recibo enumera los tres.
		expect(
			screen.getByText("2 de 3 negocios se actualizaron. 1 con error."),
		).toBeTruthy();
		expect(screen.getByText("Panadería La Espiga")).toBeTruthy();
		expect(
			screen.getByText("El negocio ya fue verificado · req_panaderia_01"),
		).toBeTruthy();
		// El negocio que NO falló no aparece en la lista de fallos.
		expect(screen.queryByText("Café Central")).toBeNull();
	});

	// 12 aprobaciones de un click son 12 toasts que tapan el único dato que
	// importa. Con el lote limpio, un aviso alcanza: no hay nada que detallar y
	// un diálogo de "0 con error" solo agrega un clic.
	test("un lote limpio no abre el diálogo de detalle", async () => {
		const calls = stubFetch({});
		renderBulk([cafe, panaderia]);

		fireEvent.click(screen.getByRole("button", { name: /Aprobar/ }));

		await waitFor(() => expect(calls).toHaveLength(2));
		expect(screen.queryByText("Resultado del lote")).toBeNull();
	});

	// Aprobar sin querer 30 negocios de un solo click no tiene vuelta atrás: el
	// diálogo de rechazo dice el número exacto y el alcance.
	test("el rechazo en lote declara el conteo exacto y el alcance", async () => {
		const calls = stubFetch({});
		renderBulk([cafe, panaderia, mercado]);

		fireEvent.click(screen.getByRole("button", { name: /Rechazar/ }));

		expect(screen.getByText("¿Rechazar 3 negocios?")).toBeTruthy();
		expect(
			screen.getByText(/se aplica a los 3 seleccionados de esta página/),
		).toBeTruthy();

		// El motivo se propaga a cada llamada: un rechazo sin motivo no le sirve
		// de nada al solicitante.
		fireEvent.change(screen.getByPlaceholderText("Motivo del rechazo"), {
			target: { value: "Documentación incompleta" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Rechazar 3/ }));

		await waitFor(() => expect(calls).toHaveLength(3));
		for (const call of calls) {
			expect(call.url).toContain("/businesses/");
			expect(call.body).toEqual({
				verification_status: "rejected",
				rejection_reason: "Documentación incompleta",
			});
		}
	});

	test("rechazar sin motivo escribe el mismo texto que usa el rechazo de una fila", async () => {
		const calls = stubFetch({});
		renderBulk([cafe]);

		fireEvent.click(screen.getByRole("button", { name: /Rechazar/ }));
		fireEvent.click(screen.getByRole("button", { name: "Rechazar 1" }));

		await waitFor(() => expect(calls).toHaveLength(1));
		expect(calls[0]?.body).toEqual({
			verification_status: "rejected",
			rejection_reason: "No especificado",
		});
	});

	test("aprobar envía la verificación a cada negocio seleccionado", async () => {
		const calls = stubFetch({});
		renderBulk([cafe, panaderia]);

		fireEvent.click(screen.getByRole("button", { name: /Aprobar/ }));

		await waitFor(() => expect(calls).toHaveLength(2));
		for (const call of calls) {
			expect(call.body).toEqual({
				verification_status: "approved",
				rejection_reason: null,
			});
		}
	});

	test("terminar el lote vacía la selección", async () => {
		stubFetch({});
		let cleared = 0;
		renderBulk([cafe, panaderia], () => {
			cleared++;
		});

		fireEvent.click(screen.getByRole("button", { name: /Aprobar/ }));

		await waitFor(() => expect(cleared).toBe(1));
	});
});
