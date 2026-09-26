import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Regresión de A6/A20: el botón "Reintentar" naveguaba al mismo search que ya
 * tenía la ruta. TanStack Router lo deduplica y React Query conserva la query
 * errored bajo la misma key, así que el botón no recuperaba nada y el operador
 * quedaba atrapado hasta un refresco manual del navegador.
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

const { Route: negociosRoute } = await import("../_layout.negocios");
const { Route: consejosRoute } = await import("../_layout.consejos");
const { Route: comisionesRoute } = await import("../_layout.comisiones");
const { Route: pagosRoute } = await import("../_layout.pagos");

const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@/test-utils/dom"
);

type RouteComponent = () => React.ReactElement;

const routes: Array<[string, { component: RouteComponent }]> = [
	["negocios", negociosRoute as unknown as { component: RouteComponent }],
	["consejos", consejosRoute as unknown as { component: RouteComponent }],
	["comisiones", comisionesRoute as unknown as { component: RouteComponent }],
	["pagos", pagosRoute as unknown as { component: RouteComponent }],
];

const previousFetch = globalThis.fetch;
let fetchCalls = 0;

function stubFailingFetch() {
	fetchCalls = 0;
	globalThis.fetch = (async () => {
		fetchCalls++;
		return new Response(
			JSON.stringify({ statusCode: 500, message: "Internal server error" }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}) as unknown as typeof fetch;
}

function renderRoute(Component: RouteComponent) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<Component />
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

describe.each(routes)("estado de error de /%s", (_name, route) => {
	test("muestra el mensaje de la API y no un texto genérico", async () => {
		stubFailingFetch();
		currentSearch = { page: 1, limit: 10 };
		renderRoute(route.component);

		// A12: el mensaje llega por `ApiClientError`, ya traducido en la capa de
		// error. Lo que se verifica aquí sigue siendo lo mismo: el operador ve
		// el mensaje del servidor, no un "Error" genérico de la vista.
		await waitFor(() =>
			expect(screen.getByText("Error interno del servidor")).toBeDefined(),
		);
	});

	test("'Reintentar' refetchea la query en vez de navegar al mismo search", async () => {
		stubFailingFetch();
		currentSearch = { page: 1, limit: 10 };
		renderRoute(route.component);

		const retry = await screen.findByRole("button", { name: "Reintentar" });
		const before = fetchCalls;
		fireEvent.click(retry);

		await waitFor(() => expect(fetchCalls).toBeGreaterThan(before));
		expect(navigate).not.toHaveBeenCalled();
	});
});
