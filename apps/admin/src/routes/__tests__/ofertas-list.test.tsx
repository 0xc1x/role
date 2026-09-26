import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * La lista de ofertas es la fila de moderación. Dos cosas no pueden fallar: el
 * estado visible tiene que corresponderse con lo que se pide al servidor, y
 * una query caída tiene que ofrecer reintento en vez de una lista vacía.
 *
 * El filtro "Inactivas" NO se puede delegar al servidor (`GET /offers` no
 * acepta `is_active`): se aplica sobre la página cargada y la vista lo dice en
 * pantalla. Estos tests fijan ese comportamiento para que nadie lo convierta en
 * un total mentiroso.
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

const { Route: ofertasRoute } = await import("../_layout.ofertas");

const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@/test-utils/dom"
);

type RouteComponent = () => React.ReactElement;
const OfertasPage = (ofertasRoute as unknown as { component: RouteComponent })
	.component as RouteComponent;

const previousFetch = globalThis.fetch;
let fetchCalls: string[] = [];

const activeOffer = {
	id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
	business_id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
	title: "Mesa de sobrantes",
	is_active: true,
	business: { name: "Café Central" },
	discounted_price: 4.5,
	original_price: 19.99,
	stock: 7,
	initial_stock: 10,
	pickup_start: "2026-09-20T15:00:00.000Z",
	pickup_end: "2026-09-20T19:00:00.000Z",
	created_at: "2026-09-19T10:00:00.000Z",
};

const inactiveOffer = {
	...activeOffer,
	id: "cccccccc-3333-4333-8333-cccccccccccc",
	title: "Pan del día anterior",
	is_active: false,
	business: { name: "Horno de la Esquina" },
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
	return fetchCalls.filter((url) => url.includes("/offers?"));
}

function okBody(data: unknown[] = [activeOffer]) {
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
			<OfertasPage />
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

describe("/ofertas — render", () => {
	test("muestra la oferta con su negocio", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 1, limit: 10, state: "all" };
		renderRoute();

		await screen.findByText("Mesa de sobrantes");
		expect(screen.getByText("Café Central")).toBeDefined();
		expect(screen.getByText("Activa")).toBeDefined();
	});
});

describe("/ofertas — filtro de estado", () => {
	// "Todas" y "Inactivas" necesitan el catálogo completo; "Publicables ahora"
	// es exactamente lo que `available_only=true` significa en la API.
	test("«todas» pide available_only=false", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 1, limit: 10, state: "all" };
		renderRoute();

		await screen.findByText("Mesa de sobrantes");
		expect(listCalls()[0]).toContain("available_only=false");
	});

	test("«publicables ahora» pide available_only=true", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 1, limit: 10, state: "available" };
		renderRoute();

		await screen.findByText("Mesa de sobrantes");
		expect(listCalls()[0]).toContain("available_only=true");
	});

	test("«inactivas» pide available_only=false y filtra la página", async () => {
		stubFetch(200, okBody([activeOffer, inactiveOffer]));
		currentSearch = { page: 1, limit: 10, state: "inactive" };
		renderRoute();

		await screen.findByText("Pan del día anterior");
		expect(listCalls()[0]).toContain("available_only=false");
		// La activa no debe aparecer bajo el filtro de inactivas.
		expect(screen.queryByText("Mesa de sobrantes")).toBeNull();
	});

	// Sin este aviso, un filtro de página se lee como un total global y el
	// operador concluye que no hay inactivas cuando solo miró diez filas.
	test("«inactivas» declara que el filtro es de la página, no del total", async () => {
		stubFetch(200, okBody([activeOffer, inactiveOffer]));
		currentSearch = { page: 1, limit: 10, state: "inactive" };
		renderRoute();

		await screen.findByText(/se filtra sobre la página cargada/);
		expect(screen.getByText(/1 de 2/)).toBeDefined();
	});

	test("sin el filtro de página la vista no muestra ese aviso", async () => {
		stubFetch(200, okBody([activeOffer, inactiveOffer]));
		currentSearch = { page: 1, limit: 10, state: "all" };
		renderRoute();

		await screen.findByText("Mesa de sobrantes");
		expect(screen.queryByText(/se filtra sobre la página cargada/)).toBeNull();
	});
});

describe("/ofertas — query caída", () => {
	test("muestra el error y ofrece reintentar en vez de una lista vacía", async () => {
		stubFetch(500, { statusCode: 500, message: "Internal server error" });
		currentSearch = { page: 1, limit: 10, state: "all" };
		renderRoute();

		await waitFor(() =>
			expect(screen.getByText("Error interno del servidor")).toBeDefined(),
		);
		expect(screen.getByRole("button", { name: "Reintentar" })).toBeDefined();
	});

	test("'Reintentar' refetchea en vez de navegar al mismo search", async () => {
		stubFetch(500, { statusCode: 500, message: "Internal server error" });
		currentSearch = { page: 1, limit: 10, state: "all" };
		renderRoute();

		const retry = await screen.findByRole("button", { name: "Reintentar" });
		const before = listCalls().length;
		fireEvent.click(retry);

		await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
		expect(navigate).not.toHaveBeenCalled();
	});
});
