import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Defectos del MISMO estado —el inline de error de las rutas de lista— y por eso
 * viven en un solo archivo:
 *
 * 1. Regresión de A6/A20: el botón "Reintentar" navegaba en vez de refetchar.
 *    Cuando el search era el mismo, TanStack Router lo deduplica y React Query
 *    conserva la query errored bajo la misma key: el botón no recuperaba nada y
 *    el operador quedaba atrapado hasta un refresco manual del navegador. Cuando
 *    el search venía limpio (página 1, sin filtros), sí cambiaba la key, pero
 *    borraba los filtros que el operador tenía puesta. Ninguna de las dos
 *    variantes es "reintentar": eso es refetchar la misma consulta.
 * 2. El mensaje mostraba solo `error.message`, sin el `requestId` que la API ya
 *    había devuelto. El operador veía un fallo sin nada con lo que soporte
 *    pudiera encontrarlo en el log del servidor.
 *
 * POR QUÉ UN SOLO ARCHIVO: `mock.module` de bun es global al proceso y
 * `bun test src` corre los specs sin `--isolate`, así que un módulo de ruta solo
 * puede importarlo UN spec: el primero que lo hace queda cacheado con las
 * closures de su mock, y el spec hermano que lo importe después recibe un
 * componente que lee el `currentSearch` del otro y falla sin que su código haya
 * cambiado. Por eso `/ordenes` y `/ofertas` fijan su propia correlación en
 * `ordenes-list.test.tsx` y `ofertas-list.test.tsx`, que ya los montan.
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
	// `EnviosTab` no es una ruta: resuelve la API con `getRouteApi`. Sin este
	// stub, su `Route.useSearch()` de módulo se ejecutaría sin contexto de router.
	getRouteApi: () => ({
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
const { Route: cuponesRoute } = await import("../_layout.cupones");
const { Route: slidesRoute } = await import("../_layout.slides");
const { Route: categoriasRoute } = await import("../_layout.categorias");
const { Route: configuracionRoute } = await import("../_layout.configuracion");
const { EnviosTab } = await import("@/features/email/components/envios-tab");

const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@/test-utils/dom"
);

type RouteComponent = () => React.ReactElement;

/** El `Route` tipado no expone `component` (es interno del router). */
function componentOf(route: unknown): RouteComponent {
	return (route as { component: RouteComponent }).component;
}

const routes: Array<[string, { component: RouteComponent }]> = [
	["negocios", negociosRoute as unknown as { component: RouteComponent }],
	["consejos", consejosRoute as unknown as { component: RouteComponent }],
	["comisiones", comisionesRoute as unknown as { component: RouteComponent }],
	["pagos", pagosRoute as unknown as { component: RouteComponent }],
	["cupones", cuponesRoute as unknown as { component: RouteComponent }],
	["slides", slidesRoute as unknown as { component: RouteComponent }],
	["categorias", categoriasRoute as unknown as { component: RouteComponent }],
	[
		"configuracion",
		configuracionRoute as unknown as { component: RouteComponent },
	],
];

/**
 * Superficies cuyo inline de error verifica la correlación aquí. `envios` no es
 * una ruta: es una pestaña dentro de /email, y por eso entra por su componente.
 */
const correlatedRoutes: Array<[string, RouteComponent]> = [
	["negocios", componentOf(negociosRoute)],
	["pagos", componentOf(pagosRoute)],
	["cupones", componentOf(cuponesRoute)],
	["slides", componentOf(slidesRoute)],
	["categorias", componentOf(categoriasRoute)],
	["configuracion", componentOf(configuracionRoute)],
	["envios", EnviosTab as RouteComponent],
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

describe.each(correlatedRoutes)("correlación de /%s", (_name, Component) => {
	test("el estado de error muestra el requestId que la API ya devolvió", async () => {
		globalThis.fetch = (async () =>
			new Response(
				JSON.stringify({
					statusCode: 500,
					message: "Internal server error",
					requestId: "3f7a1b9c-22de",
				}),
				{ status: 500, headers: { "Content-Type": "application/json" } },
			)) as unknown as typeof fetch;
		currentSearch = { page: 1, limit: 10, state: "all" };

		renderRoute(Component);

		// El identificador es lo que convierte "el panel falló" en "esta petición
		// es esta": sin él, soporte no puede cruzarlo con el log del servidor.
		await waitFor(() =>
			expect(
				screen.getByText("Error interno del servidor · 3f7a1b9c-22de"),
			).toBeDefined(),
		);
	});

	test("un fallo que no viene de la API no imprime un id vacío", async () => {
		// Sin `ApiClientError` no hay `requestId` que formatear, así que el texto
		// tiene que quedarse en el mensaje: un " · undefined" en pantalla sería
		// ruido que el operador acabaría copiando a soporte tal cual.
		globalThis.fetch = (async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		currentSearch = { page: 1, limit: 10, state: "all" };

		renderRoute(Component);

		await waitFor(() =>
			expect(screen.getByText("Failed to fetch")).toBeDefined(),
		);
		expect(screen.queryByText(/undefined/)).toBeNull();
	});
});
