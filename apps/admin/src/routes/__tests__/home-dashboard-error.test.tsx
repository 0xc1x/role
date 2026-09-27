import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// El módulo de rutas solo se importa para extraer el componente del archivo: el
// router real exigiría un contexto completo que el test no necesita. El mock
// reexporta el módulo real: bun comparte el registro entre specs y un mock que
// oculta exports rompe los specs hermanos que también mockean este módulo.
const actualRouter = await import("@tanstack/react-router");
let currentSearch: Record<string, unknown> = {};
const navigate = mock(() => undefined);
mock.module("@tanstack/react-router", () => ({
	...actualRouter,
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useSearch: () => currentSearch,
		useNavigate: () => navigate,
	}),
	Link: ({ children }: { children: React.ReactNode }) => (
		<a href="/">{children}</a>
	),
	useNavigate: () => () => undefined,
	redirect: () => undefined,
}));

const { Route } = await import("../_layout.home");

const { cleanup, render, screen, waitFor } = await import("@/test-utils/dom");

type HomeProps = Record<string, never>;
const HomePage = (Route as unknown as { component: () => React.ReactNode })
	.component as unknown as (props: HomeProps) => React.ReactElement;

const previousFetch = globalThis.fetch;
let fetchCalls = 0;

/**
 * Reporte de dinero sano. Montos distintos entre devengado y cobrado para que una
 * mezcla de las dos caras sea visible; el detalle de esa separación vive en
 * `features/stats/components/__tests__/money-section.test.tsx`, que es el dueño de
 * la sección.
 */
const revenueBody = {
	period: { from: "2026-09-01", to: "2026-09-30" },
	accrued: {
		gross_amount: 150,
		platform_fees: 20,
		business_net: 130,
		effective_commission_rate: 0.1333,
		orders: { total: 4, completed: 2, cancelled: 1, expired: 1 },
	},
	collected: {
		gross_amount: 50,
		platform_fees: 10,
		business_net: 40,
		paid_payouts: 1,
		outstanding_business_net: 90,
		outstanding_payouts: 1,
		failed_payouts: 1,
	},
};

function stubFetch(status: number, body: unknown) {
	fetchCalls = 0;
	globalThis.fetch = (async () => {
		fetchCalls++;
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

function renderHome() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<HomePage {...({} as HomeProps)} />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	mock.restore();
	globalThis.fetch = previousFetch;
	currentSearch = {};
});

describe("panel de inicio con la API caída", () => {
	// El defecto: cuatro queries sin rama isError renderizaban "0" y "todo al día".
	// Un 0 inventado se lee como "no hay nada que aprobar" y el operador no actúa.
	test("no fabrica 0 cuando la query de estadísticas falla", async () => {
		stubFetch(500, { statusCode: 500, message: "Internal server error" });

		renderHome();

		await waitFor(() => expect(fetchCalls).toBeGreaterThan(0));
		await waitFor(() => expect(screen.getAllByText("—").length).toBe(4));

		// El negativo explícito: ni un 0 en ninguna métrica.
		expect(screen.queryByText("0")).toBeNull();
		expect(screen.queryByText("0+")).toBeNull();
	});

	test("no afirma que todo está al día cuando los pendientes fallan", async () => {
		stubFetch(500, { statusCode: 500, message: "Internal server error" });

		renderHome();

		await waitFor(() =>
			expect(
				screen.getByText(/No se pudieron cargar los negocios pendientes/),
			).toBeDefined(),
		);
		expect(screen.queryByText("No hay pendientes — ¡todo al día!")).toBeNull();
	});

	test("ofrece reintentar en el panel cuando una query falla", async () => {
		stubFetch(500, { statusCode: 500, message: "Internal server error" });

		renderHome();

		const retry = await screen.findAllByRole("button", { name: "Reintentar" });
		expect(retry.length).toBeGreaterThan(0);

		const before = fetchCalls;
		const first = retry[0];
		if (!first) throw new Error("sin botón Reintentar");
		first.click();
		await waitFor(() => expect(fetchCalls).toBeGreaterThan(before));
	});
});

describe("panel de inicio con la API sana", () => {
	test("muestra los valores reales de las métricas", async () => {
		globalThis.fetch = (async (input: RequestInfo | URL) => {
			const url = String(input);
			// `/stats/revenue` también contiene "/stats": sin esta separación el
			// stub le devolvería el cuerpo de las tres métricas de marketing y el
			// panel sumaría `undefined` como si fuera dinero.
			if (url.includes("/stats/revenue")) {
				return new Response(JSON.stringify(revenueBody), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}
			if (url.includes("/stats")) {
				return new Response(
					JSON.stringify({ users: 120, businesses: 42, meals_saved: 3100 }),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				);
			}
			// 7 pendientes de 42 negocios: valores distintos para no confundirlos.
			const total = url.includes("verification_status=pending") ? 7 : 42;
			return new Response(
				JSON.stringify({ data: [], meta: { page: 1, limit: 5, total } }),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			);
		}) as unknown as typeof fetch;

		renderHome();

		await waitFor(() => expect(screen.getByText("120+")).toBeDefined());
		expect(screen.getByText("7")).toBeDefined();
		expect(screen.getByText("42")).toBeDefined();
		expect(screen.queryByText("—")).toBeNull();
	});
});
