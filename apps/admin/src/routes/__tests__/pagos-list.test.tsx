import { afterEach, describe, expect, mock, test } from "bun:test";
import { PAYOUT_STATUSES, PLATFORM_CURRENCY } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Esta spec es la dueña del módulo de `_layout.pagos` (ver la nota de
 * `mock.module` en `list-route-retry.test.tsx`: `bun test src` corre los specs sin
 * `--isolate`, así que un módulo de ruta solo puede importarlo UN spec).
 *
 * Cubre los tres defectos de la vista de pagos:
 *
 *  1. `status` y `business_id` estaban en `ListPayoutsQuerySchema` desde el
 *     contrato y NO se enviaban nunca: el operador no podía acotar los cortes.
 *  2. No había totales. Una tabla de dinero sin total obliga al operador a sumar
 *     a mano, y el alcance de esa suma es justo lo que hay que dejar explícito.
 *  3. El botón "Generar cortes" dispara la mutación sin confirmar.
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

const { Route: pagosRoute } = await import("../_layout.pagos");

const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@/test-utils/dom"
);

type PagosProps = Record<string, never>;
const PagosPage = (
	pagosRoute as unknown as {
		component: (props: PagosProps) => React.ReactElement;
	}
).component as unknown as (props: PagosProps) => React.ReactElement;

/** Rótulo esperado según la moneda del CONTRATO, no según el del panel. */
function money(amount: number): string {
	return new Intl.NumberFormat("es-EC", {
		style: "currency",
		currency: PLATFORM_CURRENCY,
		currencyDisplay: "code",
	}).format(amount);
}

/**
 * Matcher de texto para un importe. `getByText` con un string exacto normaliza
 * SOLO el texto del nodo, nunca el matcher: ICU separa el código de moneda con
 * U+00A0 y la normalización lo convierte en espacio normal, así que un matcher con
 * el NBSP crudo nunca iguala. Un matcher de función recibe el texto ya normalizado.
 */
function moneyText(amount: number) {
	const expected = money(amount).replace(/\u00a0/g, " ");
	return (content: string) => content === expected;
}

const BUSINESS_ID = "22222222-2222-4222-8222-222222222222";

/**
 * Fixture de 150 cortes con importes redondos (10/1/9). Con `limit=10` la tabla
 * muestra 10 filas; con `limit=100` el recorrido de los totales pide dos páginas.
 * Los importes por corte son iguales a propósito: si los totales salieran de la
 * página visible darían 100/10/90 en vez de 1500/150/1350, y el número DEL TOTAL es
 * la prueba del alcance sin depender de filas distinguibles.
 */
const ALL_ROWS = Array.from({ length: 150 }, (_, i) => ({
	id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
	business_id: BUSINESS_ID,
	business_name: `Negocio ${i}`,
	period_start: "2026-09-01",
	period_end: "2026-09-15",
	gross_amount: 10,
	platform_fee: 1,
	net_amount: 9,
	status: "paid" as const,
	gateway_payout_id: null,
	paid_at: "2026-09-16T03:00:00.000Z",
	created_at: "2026-09-15T23:00:00.000Z",
	updated_at: "2026-09-16T03:00:00.000Z",
}));

const previousFetch = globalThis.fetch;
let fetchCalls: string[] = [];

/**
 * Reparte filas según el `limit`/`page` que pide la URL, con el mismo `meta` que
 * devolvería la API. Es lo que permite que la tabla (limit 10) y el recorrido de
 * totales (limit 100) vean conjuntos distintos y, por eso mismo, que la prueba
 * distinga uno del otro.
 */
function stubPagedFetch(total = ALL_ROWS.length) {
	fetchCalls = [];
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input);
		fetchCalls.push(url);
		const params = new URL(url, "http://localhost").searchParams;
		const page = Number(params.get("page") ?? 1);
		const limit = Number(params.get("limit") ?? 20);
		const start = (page - 1) * limit;
		return new Response(
			JSON.stringify({
				data: ALL_ROWS.slice(start, start + limit),
				meta: {
					page,
					limit,
					total,
					total_pages: Math.max(1, Math.ceil(total / limit)),
				},
			}),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	}) as unknown as typeof fetch;
}

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

/** Llamadas al listado paginado (excluye el directorio del filtro de negocio). */
function listCalls() {
	return fetchCalls.filter((url) => url.includes("/payouts?"));
}

function renderPagos() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<PagosPage {...({} as PagosProps)} />
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

describe("/pagos — estado de error de la lista", () => {
	// Estos casos vivían en `list-route-retry.test.tsx`, que era un segundo
	// importador de `_layout.pagos`. Con la regla de un solo dueño, también son
	// responsabilidad de este archivo: si desaparecieran, nadie los cubriría.
	test("muestra el mensaje de la API y no un texto genérico", async () => {
		stubFetch(500, { statusCode: 500, message: "Internal server error" });
		currentSearch = { page: 1, limit: 10 };
		renderPagos();

		await waitFor(() =>
			expect(screen.getByText("Error interno del servidor")).toBeDefined(),
		);
	});

	test("'Reintentar' refetchea la query en vez de navegar al mismo search", async () => {
		stubFetch(500, { statusCode: 500, message: "Internal server error" });
		currentSearch = { page: 1, limit: 10 };
		renderPagos();

		const retry = await screen.findByRole("button", { name: "Reintentar" });
		const before = listCalls().length;
		fireEvent.click(retry);

		await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
		expect(navigate).not.toHaveBeenCalled();
	});

	test("el estado de error de la lista muestra el requestId", async () => {
		stubFetch(500, {
			statusCode: 500,
			message: "Internal server error",
			requestId: "3f7a1b9c-22de",
		});
		currentSearch = { page: 1, limit: 10 };
		renderPagos();

		await waitFor(() =>
			expect(
				screen.getByText("Error interno del servidor · 3f7a1b9c-22de"),
			).toBeDefined(),
		);
	});

	test("un fallo que no viene de la API no imprime un id vacío", async () => {
		globalThis.fetch = (async () => {
			throw new TypeError("Failed to fetch");
		}) as unknown as typeof fetch;
		currentSearch = { page: 1, limit: 10 };
		renderPagos();

		await waitFor(() =>
			expect(screen.getByText("Failed to fetch")).toBeDefined(),
		);
		expect(screen.queryByText(/undefined/)).toBeNull();
	});
});

describe("generar cortes desde /pagos", () => {
	test("el click en el botón no genera cortes: exige confirmación", async () => {
		stubFetch(200, { data: [], meta: { page: 1, limit: 10, total: 0 } });
		renderPagos();

		const trigger = await screen.findByRole("button", {
			name: "Generar cortes",
		});
		fireEvent.click(trigger);

		// La tabla ya cargó: si el click generara cortes, el POST ya habría salido.
		await waitFor(() => expect(fetchCalls.length).toBeGreaterThan(0));
		expect(
			fetchCalls.filter((u) => u.includes("/payouts/generate")),
		).toHaveLength(0);
	});
});

describe("/pagos — filtros", () => {
	// `status` y `business_id` venían en `ListPayoutsQuerySchema` desde antes de
	// que existiera la vista. Un filtro que no viaja es un filtro que no existe,
	// aunque el control esté en pantalla.
	test("el estado del search viaja al servidor", async () => {
		stubPagedFetch();
		currentSearch = { page: 1, limit: 10, status: "paid" };
		renderPagos();

		await waitFor(() => expect(listCalls().length).toBeGreaterThan(0));
		expect(listCalls()[0]).toContain("status=paid");
	});

	test("el trigger del estado muestra la etiqueta, no el enum crudo", async () => {
		stubPagedFetch();
		currentSearch = { page: 1, limit: 10, status: "failed" };
		renderPagos();

		// Se espera una fila, no el primer fetch: hasta que la lista resuelve, la
		// vista muestra el skeleton y no hay trigger que inspeccionar.
		await screen.findByText("Negocio 0");
		const trigger = screen.getByRole("combobox", { name: "Estado" });
		expect(trigger.textContent).toContain("Fallido");
		expect(trigger.textContent).not.toContain("failed");
	});

	test("sin estado en el search no se manda el parámetro", async () => {
		stubPagedFetch();
		currentSearch = { page: 1, limit: 10 };
		renderPagos();

		await waitFor(() => expect(listCalls().length).toBeGreaterThan(0));
		expect(listCalls()[0]).not.toContain("status=");
	});

	test("el filtro de negocio viaja con su id", async () => {
		stubPagedFetch();
		currentSearch = { page: 1, limit: 10, business_id: BUSINESS_ID };
		renderPagos();

		await waitFor(() => expect(listCalls().length).toBeGreaterThan(0));
		expect(listCalls()[0]).toContain(`business_id=${BUSINESS_ID}`);
	});

	test("el filtro se combina: estado y negocio viajan juntos", async () => {
		stubPagedFetch();
		currentSearch = {
			page: 1,
			limit: 10,
			status: "pending",
			business_id: BUSINESS_ID,
		};
		renderPagos();

		await waitFor(() => expect(listCalls().length).toBeGreaterThan(0));
		expect(listCalls()[0]).toContain("status=pending");
		expect(listCalls()[0]).toContain(`business_id=${BUSINESS_ID}`);
	});

	test("los totales respetan el filtro activo", async () => {
		stubPagedFetch();
		currentSearch = { page: 1, limit: 10, status: "pending" };
		renderPagos();

		// Se espera el total renderizado: el recorrido de páginas es una segunda
		// request y puede no haber salido cuando la tabla ya está en pantalla.
		await waitFor(() =>
			expect(screen.getByText(moneyText(1500))).toBeDefined(),
		);
		const totalsCalls = listCalls().filter((u) => u.includes("limit=100"));
		expect(totalsCalls.length).toBeGreaterThan(0);
		expect(totalsCalls[0]).toContain("status=pending");
	});

	test("los estados del contrato son los del selector", () => {
		// El selector se arma desde `PAYOUT_STATUSES`: un estado nuevo en el
		// contrato aparece sin tocar la vista, y uno que se borre se rompe la
		// compilación por el tipo de `search.status`.
		expect(PAYOUT_STATUSES).toEqual([
			"pending",
			"processing",
			"paid",
			"failed",
		]);
	});
});

describe("/pagos — totales", () => {
	test("suman el conjunto filtrado completo, no la página visible", async () => {
		stubPagedFetch();
		currentSearch = { page: 1, limit: 10 };
		renderPagos();

		// 150 cortes × (10 / 1 / 9) = 1500 / 150 / 1350. La página visible son 10
		// cortes, que darían 100 / 10 / 90: si el total fuera ese, la vista estaría
		// rotateando un subconjunto como si fuera el conjunto.
		await waitFor(() =>
			expect(screen.getByText(moneyText(1500))).toBeDefined(),
		);
		expect(screen.getByText(moneyText(150))).toBeDefined();
		expect(screen.getByText(moneyText(1350))).toBeDefined();
		expect(screen.queryByText(moneyText(100))).toBeNull();
	});

	test("el rótulo dice que el alcance es el conjunto filtrado", async () => {
		stubPagedFetch();
		currentSearch = { page: 1, limit: 10 };
		renderPagos();

		await screen.findByText("Totales del conjunto filtrado");
		// La ambiguidad a impedir: una fila de totales bajo una tabla paginada se
		// lee sola como el total de las 10 filas visibles.
		expect(
			await screen.findByText(
				/Suma de los 150 cortes del filtro, en todas las páginas/,
			),
		).toBeDefined();
		expect(screen.getByText(/esta vista muestra 10/)).toBeDefined();
	});

	test("sin paginación el rótulo no invoca páginas", async () => {
		stubPagedFetch(4);
		currentSearch = { page: 1, limit: 10 };
		renderPagos();

		await screen.findByText("Totales del conjunto filtrado");
		expect(
			await screen.findByText("Suma de los 4 corte(s) del filtro."),
		).toBeDefined();
		expect(screen.queryByText(/todas las páginas/)).toBeNull();
	});

	test("el recorrido pide páginas grandes, no las de la tabla", async () => {
		stubPagedFetch();
		currentSearch = { page: 1, limit: 10 };
		renderPagos();

		await waitFor(() =>
			expect(screen.getByText(moneyText(1500))).toBeDefined(),
		);
		const paged = listCalls().filter((u) => u.includes("limit=100"));
		// 150 cortes con page size 100 son dos páginas: si solo pidiera una, el
		// total sería la mitad y el rótulo prometería 150.
		expect(paged.some((u) => u.includes("page=1"))).toBe(true);
		expect(paged.some((u) => u.includes("page=2"))).toBe(true);
	});

	test("el conteo de cortes sumados acompaña a los importes", async () => {
		stubPagedFetch();
		currentSearch = { page: 1, limit: 10 };
		renderPagos();

		await waitFor(() =>
			expect(screen.getByText(moneyText(1500))).toBeDefined(),
		);
		// `count` es lo que hace auditable el rótulo: si un recorrido quedara
		// incompleto, el número de cortes sumados no cuadraría con el filtro.
		expect(screen.getByText("150")).toBeDefined();
	});

	test("un fallo al calcular los totales lo dice con su requestId", async () => {
		fetchCalls = [];
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = String(input);
			fetchCalls.push(url);
			if (url.includes("limit=100")) {
				return new Response(
					JSON.stringify({
						statusCode: 500,
						message: "Internal server error",
						requestId: "aa11bb22-cc33",
					}),
					{ status: 500, headers: { "Content-Type": "application/json" } },
				);
			}
			return new Response(
				JSON.stringify({
					data: ALL_ROWS.slice(0, 10),
					meta: { page: 1, limit: 10, total: 150, total_pages: 15 },
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as unknown as typeof fetch;
		currentSearch = { page: 1, limit: 10 };
		renderPagos();

		await waitFor(() =>
			expect(
				screen.getByText("Error interno del servidor · aa11bb22-cc33"),
			).toBeDefined(),
		);
		// Y no inventa un total de cero.
		expect(screen.queryByText(moneyText(0))).toBeNull();
	});
});
