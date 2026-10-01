import { afterEach, describe, expect, test } from "bun:test";
import type {
	BugReportListItemDto,
	BugReportPaginatedData,
} from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@/test-utils/dom";
import { BugReportsList } from "../bug-reports-list";

const previousFetch = globalThis.fetch;

const ID = "11111111-1111-4111-8111-111111111111";

const abierto: BugReportListItemDto = {
	id: ID,
	state: "ABIERTO",
	delivery_status: "PENDIENTE",
	origin: "ios",
	created_at: "2026-09-20T10:00:00.000Z",
	updated_at: "2026-09-20T10:00:00.000Z",
	readable: true,
	summary: "La app se cierra al pagar",
	excerpt: "La app se cierra al pagar",
};

const sinTriar: BugReportListItemDto = {
	...abierto,
	id: "22222222-2222-4222-8222-222222222222",
	state: null,
	origin: null,
	summary: "No carga el listado de ofertas",
	excerpt: "No carga el listado de ofertas",
};

const ilegible: BugReportListItemDto = {
	...abierto,
	id: "33333333-3333-4333-8333-333333333333",
	readable: false,
	summary: null,
	excerpt: null,
};

const sobre = (data: BugReportListItemDto[]): BugReportPaginatedData => ({
	data,
	meta: { page: 1, limit: 20, total: data.length, total_pages: 1 },
});

/** Devuelve las URLs pedidas para poder afirmar sobre los filtros. */
function stubFetch(data: unknown[], status = 200) {
	const urls: string[] = [];
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		urls.push(String(input));
		if (status !== 200) {
			return new Response(
				JSON.stringify({
					statusCode: status,
					message: "Internal server error",
					requestId: "req-abc12345",
				}),
				{ status, headers: { "Content-Type": "application/json" } },
			);
		}
		return new Response(JSON.stringify(sobre(data as BugReportListItemDto[])), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
	return urls;
}

function renderList(props: Partial<Parameters<typeof BugReportsList>[0]> = {}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BugReportsList
				page={1}
				limit={20}
				onPageChange={() => undefined}
				onLimitChange={() => undefined}
				onFilterChange={() => undefined}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("listado de reportes", () => {
	test("renderiza el resumen, el origen y el estado de triaje", async () => {
		stubFetch([abierto]);
		renderList();

		await waitFor(() =>
			expect(screen.getByText("La app se cierra al pagar")).toBeDefined(),
		);
		// El origen se muestra con su etiqueta, no con el token crudo del enum.
		expect(screen.getByText("iOS")).toBeDefined();
		expect(screen.getByText("Abierto")).toBeDefined();
	});

	test("una fila sin triage dice 'Sin triar', no 'Sin datos legibles'", async () => {
		stubFetch([sinTriar]);
		renderList();

		// `state: null` y `readable: false` son dos hechos distintos: una fila
		// legible y sin triageAR sigue mostrando su texto. Fusionar los dos textos
		// haría que el operador creyera que el reporte se perdió.
		await waitFor(() =>
			expect(screen.getByText("No carga el listado de ofertas")).toBeDefined(),
		);
		expect(screen.getByText("Sin triar")).toBeDefined();
		expect(screen.queryByText("Sin datos legibles")).toBeNull();
	});

	test("una fila ilegible se lista y lo dice, en vez de mostrar guiones", async () => {
		stubFetch([ilegible]);
		renderList();

		await waitFor(() =>
			expect(screen.getByText("Sin datos legibles")).toBeDefined(),
		);
	});

	test("la fecha de la fila no depende del huso del navegador", async () => {
		// La fila y el drawer muestran el MISMO instante en la misma pantalla, así
		// que un `toLocaleDateString` (zona del navegador) contra el
		// `formatBusinessDate` del drawer (zona fija) se contradicen en cuanto el
		// navegador no está en Ecuador. Se cambia `process.env.TZ` porque Bun lo lee
		// en cada llamada: sin eso el test pasaría en esta caja y solo fallaría en
		// la de otro.
		//
		// 02:00Z del día 20 es el día 19 en Guayaquil (UTC-5) y el día 20 en UTC.
		// O sea que el assert distingue las dos implementaciones.
		const tzPrevio = process.env.TZ;
		process.env.TZ = "UTC";
		try {
			stubFetch([{ ...abierto, created_at: "2026-09-20T02:00:00.000Z" }]);
			renderList();

			await waitFor(() =>
				expect(screen.getByText("La app se cierra al pagar")).toBeDefined(),
			);
			// La fila y la ficha tienen que decir lo mismo. El drawer ya usa el
			// formatter fijo, así que la fila es la que estaba mal.
			expect(screen.getByText("19/9/2026")).toBeDefined();
			expect(screen.queryByText("20/9/2026")).toBeNull();
		} finally {
			process.env.TZ = tzPrevio;
		}
	});

	test("no muestra el estado de entrega, que en esta bandeja no significa nada", async () => {
		stubFetch([abierto]);
		renderList();

		await waitFor(() =>
			expect(screen.getByText("La app se cierra al pagar")).toBeDefined(),
		);
		// `delivery_status` lo mueve el camino de correo del formulario público, y
		// un reporte de error no tiene ese camino: nadie lo mueve después del
		// insert. Un badge acá sería un "Entrega pendiente" eterno que el operador
		// leería como una tarea pendiente que ya no existe.
		expect(screen.queryByText("Entrega pendiente")).toBeNull();
		expect(screen.queryByText("Notificado")).toBeNull();
	});

	test("no muestra el reporter_id aunque la respuesta lo traiga", async () => {
		// La garantía es que el listado no publica PII, y la lista no parsea: lo
		// que llega crudo llega crudo al objeto de la fila. Por eso el aserto es
		// sobre una respuesta que INVENTA el campo, no sobre el DTO tipado: si la
		// fila se llegara a pintar, aquí lo vería.
		stubFetch([
			{ ...abierto, reporter_id: "aaaaaaaa-1111-4111-8111-111111111111" },
		]);
		renderList();

		await waitFor(() =>
			expect(screen.getByText("La app se cierra al pagar")).toBeDefined(),
		);
		expect(screen.queryByText(/aaaaaaaa-1111-4111-8111/)).toBeNull();
	});

	test("sin filas informa que no hay reportes con este filtro", async () => {
		stubFetch([]);
		renderList();

		await waitFor(() =>
			expect(
				screen.getByText("No hay reportes de error con este filtro."),
			).toBeDefined(),
		);
	});
});

describe("filtros del listado", () => {
	test("sin filtros no manda state ni origin en la URL", async () => {
		const urls = stubFetch([abierto]);
		renderList();

		await waitFor(() => expect(urls.length).toBeGreaterThan(0));
		expect(urls[0]).not.toContain("state=");
		expect(urls[0]).not.toContain("origin=");
	});

	test("el filtro de estado viaja como ?state=", async () => {
		const urls = stubFetch([abierto]);
		renderList({ state: "ABIERTO" });

		await waitFor(() => expect(urls.length).toBeGreaterThan(0));
		expect(urls[0]).toContain("state=ABIERTO");
	});

	test("el filtro de origin viaja como ?origin=", async () => {
		const urls = stubFetch([abierto]);
		renderList({ origin: "android" });

		await waitFor(() => expect(urls.length).toBeGreaterThan(0));
		expect(urls[0]).toContain("origin=android");
	});

	test("los dos filtros viajan juntos y no se pisan", async () => {
		const urls = stubFetch([abierto]);
		renderList({ state: "CORREGIDO", origin: "pwa" });

		await waitFor(() => expect(urls.length).toBeGreaterThan(0));
		expect(urls[0]).toContain("state=CORREGIDO");
		expect(urls[0]).toContain("origin=pwa");
	});
});

describe("requestId en el fallo", () => {
	test("un 500 del listado muestra el requestId y un botón de reintentar", async () => {
		// El `requestId` es lo único que correlaciona el aviso del operador con el
		// log del servidor. Sin él, un 500 es indistinguible de otros mil — y el
		// "Reintentar" es lo que convierte el fallo en algo recuperable en vez de
		// en una pantalla muerta.
		stubFetch([], 500);
		renderList();

		await waitFor(() =>
			expect(
				screen.getByText("Error interno del servidor · req-abc12345"),
			).toBeDefined(),
		);
		expect(screen.getByRole("button", { name: "Reintentar" })).toBeDefined();
	});

	test("un fallo no se disfraza de lista vacía", async () => {
		stubFetch([], 500);
		renderList();

		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Reintentar" })).toBeDefined(),
		);
		expect(
			screen.queryByText("No hay reportes de error con este filtro."),
		).toBeNull();
	});
});
