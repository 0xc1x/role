import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * El listado de órdenes es la pantalla con la que un operador responde "me
 * dejaron comida y la app dice que no". Tres cosas no pueden fallar: los
 * filtros tienen que llegar al servidor, una query caida tiene que ofrecer
 * reintento (nunca un "0 órdenes" fabricado) y las etiquetas de estado tienen
 * que estar en español.
 */
let currentSearch: Record<string, unknown> = {};
let navigate: ReturnType<typeof mock> = mock(() => undefined);

const actualRouter = await import("@tanstack/react-router");

mock.module("@tanstack/react-router", () => ({
	...actualRouter,
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useSearch: () => currentSearch,
		useNavigate:
			() =>
			(...args: unknown[]) =>
				navigate(...args),
	}),
	useNavigate: () => () => undefined,
	redirect: () => undefined,
}));

const { Route: ordenesRoute } = await import("../_layout.ordenes");

const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@/test-utils/dom"
);

type RouteComponent = () => React.ReactElement;
const OrdenesPage = (ordenesRoute as unknown as { component: RouteComponent })
	.component as RouteComponent;

const previousFetch = globalThis.fetch;
let fetchCalls: string[] = [];

const order = {
	id: "11111111-1111-4111-8111-111111111111",
	order_number: "FD-2026-0101-001",
	status: "ready_for_pickup",
	business_id: "22222222-2222-4222-8222-222222222222",
	business_name: "Café Central",
	offer_id: "33333333-3333-4333-8333-333333333333",
	offer_title: "Mesa de sobrantes del lunes",
	price: 4.5,
	original_price: 19.99,
	pickup_start: "2026-09-20T15:00:00.000Z",
	pickup_end: "2026-09-20T19:00:00.000Z",
	is_stuck: false,
	created_at: "2026-09-19T10:00:00.000Z",
	updated_at: "2026-09-19T10:00:00.000Z",
};

function stubFetch(status: number, body: unknown) {
	fetchCalls = [];
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		fetchCalls.push(String(input));
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

function listCalls() {
	return fetchCalls.filter((url) => url.includes("/orders/admin"));
}

function okBody(data: unknown[] = [order]) {
	return {
		data,
		meta: { page: 1, limit: 10, total: data.length, total_pages: 1 },
	};
}

function renderRoute() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<OrdenesPage />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	mock.restore();
	globalThis.fetch = previousFetch;
	currentSearch = {};
	navigate = mock(() => undefined);
});

describe("/ordenes — render", () => {
	test("lista las órdenes con el estado en español", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 1, limit: 10 };
		renderRoute();

		await screen.findByText("FD-2026-0101-001");
		expect(screen.getByText("Café Central")).toBeDefined();
		expect(screen.getByText("Lista para recoger")).toBeDefined();
		expect(screen.queryByText("ready_for_pickup")).toBeNull();
	});

	test("el total viene del servidor, no de las filas de la página", async () => {
		stubFetch(200, {
			data: [order],
			meta: { page: 1, limit: 10, total: 37, total_pages: 4 },
		});
		currentSearch = { page: 1, limit: 10 };
		renderRoute();

		await screen.findByText("FD-2026-0101-001");
		expect(screen.getByText(/37/)).toBeDefined();
	});
});

describe("/ordenes — filtros", () => {
	// El popup de `Select` (Base UI) no monta en happy-dom — la misma limitación
	// que ya documenta `pagos-generate-confirm.test.tsx`. Por eso el estado se
	// verifica por su efecto observable (lo que viaja al servidor) y el cableado
	// de `navigate(..., page: 1)` se verifica con el switch, que sí es pulsable.
	test("el estado del search viaja al servidor y el trigger no muestra el enum crudo", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 4, limit: 10, status: "ready_for_pickup" };
		renderRoute();

		await screen.findByText("FD-2026-0101-001");
		expect(listCalls()[0]).toContain("status=ready_for_pickup");
		// El trigger del filtro no puede mostrar `ready_for_pickup`: es el mismo
		// enum crudo que la tabla ya traduce.
		const trigger = screen.getByRole("combobox", { name: "Estado" });
		expect(trigger.textContent).toContain("Lista para recoger");
		expect(trigger.textContent).not.toContain("ready_for_pickup");
	});

	test("«solo atascadas» pide el filtro y reinicia la paginación", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 4, limit: 10 };
		renderRoute();

		fireEvent.click(
			await screen.findByRole("switch", { name: "Solo órdenes atascadas" }),
		);

		await waitFor(() => expect(navigate).toHaveBeenCalled());
		const arg = navigate.mock.calls[0]?.[0] as {
			search: { stuck?: boolean; page: number };
		};
		expect(arg.search.stuck).toBe(true);
		expect(arg.search.page).toBe(1);
	});

	// El search ya parseó el schema del contrato: `stuck` llega como texto en la
	// URL y la query debe viajar como booleano, no como "true".
	test("stuck ya booleano tras validar el search llega como booleano", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 1, limit: 10, stuck: true };
		renderRoute();

		await waitFor(() => expect(listCalls()).toHaveLength(1));
		expect(listCalls()[0]).toContain("stuck=true");
	});

	test("el filtro de negocio viaja con su id", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 1, limit: 10, business_id: order.business_id };
		renderRoute();

		await waitFor(() => expect(listCalls()).toHaveLength(1));
		expect(listCalls()[0]).toContain(`business_id=${order.business_id}`);
	});

	test("con «solo atascadas» la vista explica cuántas hay", async () => {
		stubFetch(200, {
			data: [{ ...order, is_stuck: true }],
			meta: { page: 1, limit: 10, total: 1, total_pages: 1 },
		});
		currentSearch = { page: 1, limit: 10, stuck: true };
		renderRoute();

		await screen.findByText(/1 orden\./);
	});
});

describe("/ordenes — query caída", () => {
	test("muestra el mensaje de la API y ofrece reintentar", async () => {
		stubFetch(500, { statusCode: 500, message: "Internal server error" });
		currentSearch = { page: 1, limit: 10 };
		renderRoute();

		await waitFor(() =>
			expect(screen.getByText("Error interno del servidor")).toBeDefined(),
		);
		expect(screen.queryByText("0 órdenes")).toBeNull();
		expect(screen.getByRole("button", { name: "Reintentar" })).toBeDefined();
	});

	test("'Reintentar' refetchea en vez de navegar al mismo search", async () => {
		stubFetch(500, { statusCode: 500, message: "Internal server error" });
		currentSearch = { page: 1, limit: 10 };
		renderRoute();

		const retry = await screen.findByRole("button", { name: "Reintentar" });
		const before = listCalls().length;
		fireEvent.click(retry);

		await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
		expect(navigate).not.toHaveBeenCalled();
	});
});
