import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// `test-utils/dom` se importa ESTÁTICO y arriba de todo, no con `await import`
// como hacen otros specs de ruta. Medido: cargado después del `mock.module` del
// router, el popup de un `Select` de base-ui deja de abrirse con el teclado y
// ningún test de esta suite podría elegir una opción. El módulo instala el DOM
// de happy-dom antes de que se ligue testing-library, y ese orden es lo que lo
// hace funcionar.
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";

/**
 * La lista de anuncios es la superficie donde el operador ve lo que ya publicó.
 * Tres cosas que no pueden fallar:
 *
 *  - los filtros de la barra van al servidor, no a la página: `severity` y
 *    `active` son filtros de `GET /announcements/admin`. Un filtro de página
 *    apresentado como total global sería un "0 resultados" sobre lo que hay.
 *  - NO hay filtro de audiencia, y no debe aparecer uno: el endpoint no acepta
 *    `?audience=` —la audiencia la escribe el operador al publicar— así que
 *    cualquier filtro de audiencia sería de página y mentiría.
 *  - una query caída ofrece reintento en vez de una lista vacía.
 */
let currentSearch: Record<string, unknown> = {};
/** Cada llamada a `navigate`, para afirmar sobre el search que se pidió. */
let navegaciones: unknown[][] = [];

const actualRouter = await import("@tanstack/react-router");

mock.module("@tanstack/react-router", () => ({
	...actualRouter,
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useSearch: () => currentSearch,
		useNavigate:
			() =>
			(...args: unknown[]) => {
				navegaciones.push(args);
			},
	}),
	useNavigate: () => () => undefined,
	redirect: () => undefined,
}));

const { Route: anunciosRoute } = await import("../_layout.anuncios");

type RouteComponent = () => React.ReactElement;
const AnunciosPage = (anunciosRoute as unknown as { component: RouteComponent })
	.component as RouteComponent;

const previousFetch = globalThis.fetch;
let fetchCalls: string[] = [];

const vigente = {
	id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
	title: "Mantenimiento del sábado",
	body: "No hay ofertas nuevas entre las 3 y las 5.",
	severity: "info",
	audience_kind: "all",
	priority: 0,
	active: true,
	start_at: null,
	end_at: null,
	created_at: "2026-10-01T10:00:00.000Z",
	updated_at: "2026-10-01T10:00:00.000Z",
};

const obligatorio = {
	...vigente,
	id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
	title: "Actualizá la app antes del domingo",
	severity: "required",
	audience_kind: "consumers",
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
	return fetchCalls.filter((url) => url.includes("/announcements/admin?"));
}

function okBody(data: unknown[] = [vigente]) {
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
			<AnunciosPage />
		</QueryClientProvider>,
	);
}

/**
 * Elige una opción de un `Select` de Base UI POR TECLADO, que es el único
 * camino que funciona en este repo: `fireEvent.click` sobre el combobox no abre
 * el popup bajo bun:test, medido. El recorrido es el de un operador que navega
 * con teclado —`ArrowDown` abre y enfoca el valor vigente, `ArrowDown` mueve,
 * `Enter` elige— y es el mismo que usa `bug-reports-list.test.tsx`.
 */
async function elegir(nombre: string, etiqueta: string) {
	fireEvent.keyDown(await screen.findByRole("combobox", { name: nombre }), {
		key: "ArrowDown",
	});
	const opcion = await screen.findByRole("option", { name: etiqueta });
	// El puntero completo —`pointerdown` + `pointerup` + `click`— y no un `click`
	// a secas: base-ui escucha puntero en los items del popup, y con el click
	// solo el popup se abre pero la opción no se elige. Es lo mismo que hace
	// `hide-review-dialog.test.tsx`.
	fireEvent.pointerDown(opcion, { pointerId: 1, isPrimary: true, button: 0 });
	fireEvent.pointerUp(opcion, { pointerId: 1, isPrimary: true, button: 0 });
	fireEvent.click(opcion);
	await waitFor(() => expect(screen.queryAllByRole("option")).toHaveLength(0));
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
	currentSearch = {};
	navegaciones = [];
});

describe("/anuncios — render", () => {
	test("muestra el aviso con su severidad y su audiencia en español", async () => {
		stubFetch(200, okBody([vigente, obligatorio]));
		currentSearch = { page: 1, limit: 10 };
		renderRoute();

		await screen.findByText("Mantenimiento del sábado");
		// El token crudo en la columna sería `all`/`consumers`: el operador tiene que
		// distinguir de un vistazo "a todo el mundo" de "a las consumidoras".
		expect(screen.getAllByText("Todo el mundo").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Consumidoras").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Informativo").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Obligatorio").length).toBeGreaterThan(0);
	});

	test("un aviso específico no muestra a cuántas personas le llega", async () => {
		stubFetch(200, okBody([{ ...vigente, audience_kind: "specific" }]));
		currentSearch = { page: 1, limit: 10 };
		renderRoute();

		// La columna dice el TIPO de audiencia. Un número de destinatarios sería
		// inventado: las dos listas de audiencia no vienen en la lectura.
		await screen.findByText("Mantenimiento del sábado");
		expect(screen.getAllByText("Personas específicas").length).toBeGreaterThan(
			0,
		);
		expect(document.body.textContent).not.toContain("destinatarios");
	});
});

describe("/anuncios — los filtros van al servidor", () => {
	test("«obligatorios» pide severity=required", async () => {
		stubFetch(200, okBody([obligatorio]));
		currentSearch = { page: 1, limit: 10, severity: "required" };
		renderRoute();

		await screen.findByText("Actualizá la app antes del domingo");
		expect(listCalls()[0]).toContain("severity=required");
	});

	test("«inactivos» pide active=false", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 1, limit: 10, active: false };
		renderRoute();

		await screen.findByText("Mantenimiento del sábado");
		expect(listCalls()[0]).toContain("active=false");
	});

	test("sin filtros no manda ninguno", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 1, limit: 10 };
		renderRoute();

		await screen.findByText("Mantenimiento del sábado");
		expect(listCalls()[0]).not.toContain("severity=");
		expect(listCalls()[0]).not.toContain("active=");
	});

	// El filtro de audiencia NO existe y no se inventa: `GET /announcements` no lo
	// acepta, y la audiencia se escribe al publicar. Un filtro de página con esa
	// forma sería un "no hay avisos" sin nada que lo sostenga.
	test("no hay filtro de audiencia en la barra", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 1, limit: 10 };
		renderRoute();

		await screen.findByText("Mantenimiento del sábado");
		expect(screen.queryByRole("combobox", { name: "Audiencia" })).toBeNull();
	});
});

describe("/anuncios — cambiar un filtro", () => {
	test("vuelve a la página 1", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 4, limit: 10 };
		renderRoute();
		await screen.findByText("Mantenimiento del sábado");

		await elegir("Severidad", "Obligatorio");

		// Quedarse en la página 4 de un filtro nuevo muestra una lista vacía y
		// parece que el filtro no encontró nada.
		expect(navegaciones.length).toBe(1);
		expect(navegaciones[0]?.[0]).toMatchObject({
			search: { page: 1, severity: "required" },
		});
	});

	test("«todos los estados» saca el filtro de vigencia de la URL", async () => {
		stubFetch(200, okBody());
		currentSearch = { page: 1, limit: 10, active: false };
		renderRoute();
		await screen.findByText("Mantenimiento del sábado");

		await elegir("Estado", "Todos los estados");

		expect(navegaciones[0]?.[0]).toMatchObject({
			search: { page: 1, active: undefined },
		});
	});
});

describe("/anuncios — el listado caído", () => {
	test("muestra el motivo y ofrece reintentar, no una lista vacía", async () => {
		stubFetch(500, {
			statusCode: 500,
			message: "No se pudieron obtener los anuncios",
		});
		currentSearch = { page: 1, limit: 10 };
		renderRoute();

		await screen.findByText("No se pudieron obtener los anuncios");
		expect(screen.getByRole("button", { name: "Reintentar" })).toBeDefined();
		expect(screen.queryByText("Mantenimiento del sábado")).toBeNull();
	});
});
