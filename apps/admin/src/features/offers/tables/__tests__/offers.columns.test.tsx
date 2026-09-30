import { afterEach, describe, expect, test } from "bun:test";
import type { OfferWithBusiness } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataTable } from "@/components/data-table/data-table";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { offersColumns } from "../offers.columns";

/**
 * Una ofertaModerada a ciegas es una oferta cobrada de más: la fila tiene que
 * dar negocio, título, ambos precios, stock y ventana para que el operador
 * pueda juzgarla sin abrir nada.
 */

const offer: OfferWithBusiness = {
	id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
	business_id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
	business_location_id: "cccccccc-3333-4333-8333-cccccccccccc",
	title: "Mesa de sobrantes del lunes",
	description: null,
	image: null,
	category_ids: [],
	categories: [],
	original_price: 19.99,
	discounted_price: 4.5,
	discount_percentage: 77,
	stock: 7,
	initial_stock: 10,
	pickup_start: "2026-09-20T15:00:00.000Z",
	pickup_end: "2026-09-20T19:00:00.000Z",
	is_active: true,
	includes: null,
	allergens: null,
	rating: 0,
	review_count: 0,
	created_at: "2026-09-19T10:00:00.000Z",
	updated_at: "2026-09-19T10:00:00.000Z",
	business: {
		id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
		name: "Café Central",
		slug: "cafe-central",
		image: null,
		rating: null,
	},
	location: {
		id: "cccccccc-3333-4333-8333-cccccccccccc",
		name: "Principal",
		address: "Av. Patria 100",
		latitude: -0.22,
		longitude: -0.52,
		zone: null,
	},
};

const previousFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; method: string }> = [];

function stubFetch(status: number, body: unknown) {
	fetchCalls = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		fetchCalls.push({ url: String(input), method: init?.method ?? "GET" });
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

function renderTable(data: OfferWithBusiness[] = [offer]) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<DataTable
				columns={offersColumns}
				data={data}
				meta={{ page: 1, limit: 10, total: data.length, total_pages: 1 }}
			/>
		</QueryClientProvider>,
	);
}

/** Abre el menú de la celda de la primera fila. */
async function openActionsMenu() {
	fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
	await screen.findByRole("menu");
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("listado de ofertas", () => {
	test("muestra negocio, título, ambos precios, stock y ventana de pickup", () => {
		renderTable();

		expect(screen.getByText("Café Central")).toBeDefined();
		expect(screen.getByText("Mesa de sobrantes del lunes")).toBeDefined();
		expect(screen.getByText("$4.50")).toBeDefined();
		expect(screen.getByText("$19.99")).toBeDefined();
		expect(screen.getByText("7 / 10")).toBeDefined();
		// La ventana se muestra como un rango formateado, no como un ISO crudo.
		// El esperado se arma con el mismo formatter para no depender del TZ.
		const windowFmt = new Intl.DateTimeFormat("es-EC", {
			dateStyle: "short",
			timeStyle: "short",
		});
		const expected = `${windowFmt.format(new Date(offer.pickup_start))} → ${windowFmt.format(new Date(offer.pickup_end))}`;
		expect(screen.getByText(expected)).toBeDefined();
	});

	test("distingue la oferta activa de la inactiva", () => {
		renderTable([offer, { ...offer, id: "otro", is_active: false }]);

		expect(screen.getByText("Activa")).toBeDefined();
		expect(screen.getByText("Inactiva")).toBeDefined();
	});
});

describe("desactivar una oferta", () => {
	// Desactivar saca la oferta del marketplace al instante. Un clic sin
	// confirmación esconde una oferta que alguien ya estaba por recoger.
	test("exige confirmación que nombra el negocio y la oferta", async () => {
		stubFetch(200, undefined);
		renderTable();

		await openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Desactivar/ }));

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("Mesa de sobrantes del lunes");
		expect(dialog.textContent).toContain("Café Central");
		// Nada salió aún: la confirmación es el punto de control.
		expect(fetchCalls).toHaveLength(0);
	});

	test("llama al DELETE solo después de confirmar", async () => {
		stubFetch(200, undefined);
		renderTable();

		await openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Desactivar/ }));
		fireEvent.click(await screen.findByRole("button", { name: /Desactivar/ }));

		await waitFor(() => expect(fetchCalls).toHaveLength(1));
		expect(fetchCalls[0]?.method).toBe("DELETE");
		expect(fetchCalls[0]?.url).toContain(`/offers/${offer.id}`);
	});

	// La API responde 200 sin cuerpo: un cliente que exija JSON reportaría
	// fallo después de haber desactivado la oferta.
	test("no falla cuando la API responde sin cuerpo", async () => {
		fetchCalls = [];
		globalThis.fetch = (async (
			input: RequestInfo | URL,
			init?: RequestInit,
		) => {
			fetchCalls.push({
				url: String(input),
				method: init?.method ?? "GET",
			});
			return new Response("", { status: 200 });
		}) as unknown as typeof fetch;
		renderTable();

		await openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Desactivar/ }));
		fireEvent.click(await screen.findByRole("button", { name: /Desactivar/ }));

		await waitFor(() => expect(fetchCalls).toHaveLength(1));
		expect(fetchCalls[0]?.method).toBe("DELETE");
	});

	test("cancelar no llama a la API", async () => {
		stubFetch(200, undefined);
		renderTable();

		await openActionsMenu();
		fireEvent.click(screen.getByRole("menuitem", { name: /Desactivar/ }));
		fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

		await waitFor(() => expect(fetchCalls).toHaveLength(0));
	});
});

describe("reactivar una oferta", () => {
	test("hace PATCH directo, sin confirmación, y no aparece en una activa", () => {
		stubFetch(200, offer);
		renderTable();

		expect(screen.queryByRole("button", { name: /Reactivar/ })).toBeNull();
	});

	test("reactiva la oferta inactiva con un PATCH", async () => {
		stubFetch(200, { ...offer, is_active: true });
		renderTable([{ ...offer, is_active: false }]);

		fireEvent.click(screen.getByRole("button", { name: /Reactivar/ }));

		await waitFor(() => expect(fetchCalls).toHaveLength(1));
		expect(fetchCalls[0]?.method).toBe("PATCH");
		expect(fetchCalls[0]?.url).toContain(`/offers/${offer.id}`);
	});
});
