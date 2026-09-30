import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Esta spec es la dueña del módulo de `_layout.resenas` (ver la nota de
 * `mock.module` en `list-route-retry.test.tsx`: `bun test src` corre los specs sin
 * `--isolate`, así que un módulo de ruta solo puede importarlo UN spec).
 *
 * Defiende el defecto que tumbaba la pantalla de moderación:
 *
 *  1. La ruta tenía `loader` + `loaderDeps` con
 *     `context.queryClient.ensureQueryData(...)`. Un loader corre ANTES de que
 *     el componente renderice, así que el fallo de la consulta escapaba hacia el
 *     `errorComponent` de la ruta —que no existe en ninguna de las veinte rutas
 *     del panel— en vez de entrar a la rama `isError` del componente. Un 500 de
 *     la API se comía la página entera.
 *  2. "Reintentar" navegaba en vez de refetchar, y con la URL ya en `?page=1` la
 *     navegación era nula: el clic no hacía nada.
 *
 * El primer defecto no se puede ver montando el componente —ahí el error siempre
 * entra por `isError`—, por eso el candado real es la forma de la definición de
 * la ruta y no solo el render.
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

const { Route: resenasRoute } = await import("../_layout.resenas");

const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@/test-utils/dom"
);

type RouteComponent = () => React.ReactElement;

const ResenasPage = (
	resenasRoute as unknown as {
		component: RouteComponent;
	}
).component;

/** La definición de la ruta, con la forma que el router mira de verdad. */
const definition = resenasRoute as unknown as {
	loader?: unknown;
	loaderDeps?: unknown;
	errorComponent?: unknown;
};

const previousFetch = globalThis.fetch;
let fetchCalls: string[] = [];

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

/** Llamadas al listado de moderación. */
function listCalls() {
	return fetchCalls.filter((url) => url.includes("/reviews/moderation"));
}

function renderResenas() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<ResenasPage />
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

describe("/resenas — forma de la ruta", () => {
	test("no declara loader ni loaderDeps: el fallo tiene que entrar por el componente", () => {
		// El candado del defecto. Un `loader` con `ensureQueryData` corre antes
		// del render, así que un 500 no llega a la rama `isError` de la bandeja:
		// sale despedido hacia el `errorComponent` de la ruta, que no existe, y
		// React deja la pantalla en blanco. Sin loader, la consulta la dispara el
		// componente y el error se pinta inline con su requestId.
		expect(definition.loader).toBeUndefined();
		expect(definition.loaderDeps).toBeUndefined();
	});

	test("un loader solo puede volver si la ruta trae su propio errorComponent", () => {
		const tieneLoader =
			definition.loader !== undefined || definition.loaderDeps !== undefined;
		const tieneErrorComponent = definition.errorComponent !== undefined;
		// La condición que hace falta para que reintroducir el loader sea seguro.
		// Hoy la ruta no tiene de ninguno de los dos, así que la precondición se
		// cumple; si alguien devuelve el loader sin el boundary, esto falla y le
		// dice qué le falta en vez de dejarle tumbar la pantalla otra vez.
		expect(tieneLoader && !tieneErrorComponent).toBe(false);
	});
});

describe("/resenas — estado de error de la lista", () => {
	test("con la API caída el operador ve el error inline, no una pantalla en blanco", async () => {
		stubFetch(500, {
			statusCode: 500,
			message: "Internal server error",
			requestId: "9c8b7a6d-5e4f",
		});
		currentSearch = { page: 1, limit: 20, visibility: "all" };
		renderResenas();

		// El `requestId` prueba que el mensaje lo formateó `formatApiError` en el
		// componente: es la rama `isError`, no un error de ruta sin capturar.
		await waitFor(() =>
			expect(
				screen.getByText("Error interno del servidor · 9c8b7a6d-5e4f"),
			).toBeDefined(),
		);
		// El armazón de la ruta sigue montado. Un error fatal de ruta lo
		// desmonta entero, así que perderlo también distingue los dos casos.
		expect(screen.getByText("Reseñas")).toBeDefined();
		expect(screen.getByRole("button", { name: "Reintentar" })).toBeDefined();
		expect(screen.queryByText("No hay reseñas con este filtro.")).toBeNull();
	});

	test("'Reintentar' vuelve a pedir la lista y no navega", async () => {
		stubFetch(500, { statusCode: 500, message: "Internal server error" });
		currentSearch = { page: 1, limit: 20, visibility: "all" };
		renderResenas();

		const retry = await screen.findByRole("button", { name: "Reintentar" });
		const before = listCalls().length;
		fireEvent.click(retry);

		await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
		// Aquí el caso es más fuerte que en el componente: `onPageChange` de la
		// bandeja es `navigate({ search })` de la ruta, así que un botón que
		// navegara en vez de refetchar se vería en este `navigate`. Con la URL
		// ya en `?page=1` el router la deduplica y el clic no recupera nada.
		expect(navigate).not.toHaveBeenCalled();
	});
});
