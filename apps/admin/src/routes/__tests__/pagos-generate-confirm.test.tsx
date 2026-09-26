import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * A7: el botón "Generar cortes" no dispara la mutación; solo abre la
 * confirmación. La confirmación en sí se prueba en
 * `features/payouts/components/__tests__/generate-payouts-dialog.test.tsx`
 * (en este archivo el diálogo de Base UI no monta con el módulo del router
 * mockeado, pero el cableado del trigger sí es verificable).
 */
const actualRouter = await import("@tanstack/react-router");

mock.module("@tanstack/react-router", () => ({
	...actualRouter,
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useSearch: () => ({ page: 1, limit: 10 }),
		useNavigate: () => () => undefined,
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

function generateCalls() {
	return fetchCalls.filter((url) => url.includes("/payouts/generate"));
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
		expect(generateCalls()).toHaveLength(0);
	});
});
