import { afterEach, describe, expect, test } from "bun:test";
import type { PayoutDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { payoutsColumns } from "../payouts.columns";

/**
 * Un pago liquidado no se deshace. Estos tests renderizan la celda de acciones
 * directamente (sin el `DataTable` completo) porque el diálogo de Base UI no
 * monta dentro de la tabla completa en happy-dom: el objeto bajo prueba es la
 * confirmación, no el layout.
 */

const pendingPayout: PayoutDto = {
	id: "33333333-3333-4333-8333-333333333333",
	business_id: "11111111-1111-4111-8111-111111111111",
	business_name: "Café Central",
	period_start: "2026-09-01",
	period_end: "2026-09-15",
	gross_amount: 150,
	platform_fee: 30,
	net_amount: 120,
	status: "pending",
	gateway_payout_id: null,
	paid_at: null,
	created_at: "2026-09-16T03:00:00.000Z",
	updated_at: "2026-09-16T03:00:00.000Z",
};

const previousFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; method: string }> = [];

function stubFetch(status: number, body: unknown) {
	fetchCalls = [];
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		fetchCalls.push({ url: String(input), method: init?.method ?? "GET" });
		return new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	}) as unknown as typeof fetch;
}

type ColumnCell = (ctx: unknown) => React.ReactNode;

function columnById(id: string): ColumnCell {
	// `accessorKey` solo existe en las variantes de ColumnDef que lo declaran.
	const column = payoutsColumns.find(
		(c) => c.id === id || (c as { accessorKey?: string }).accessorKey === id,
	);
	const cell = column?.cell as ColumnCell | undefined;
	if (!cell) throw new Error(`columna ${id} sin celda`);
	return cell;
}

function renderActionsCell(payout: PayoutDto) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<table>
				<tbody>
					<tr>
						<td>{columnById("actions")({ row: { original: payout } })}</td>
					</tr>
				</tbody>
			</table>
		</QueryClientProvider>,
	);
}

function renderStatusCell(payout: PayoutDto) {
	const queryClient = new QueryClient();
	return render(
		<QueryClientProvider client={queryClient}>
			<table>
				<tbody>
					<tr>
						<td>{columnById("status")({ row: { original: payout } })}</td>
					</tr>
				</tbody>
			</table>
		</QueryClientProvider>,
	);
}

/** Botón de la celda (el del diálogo tiene el mismo nombre pero es `submit`). */
function payButton(): HTMLElement {
	const cellButton = screen
		.getAllByRole("button", { name: /Marcar pagado/ })
		.find((el) => el.getAttribute("type") !== "submit");
	if (!cellButton) throw new Error("no se encontró el botón de la celda");
	return cellButton;
}

afterEach(() => {
	cleanup();
	globalThis.fetch = previousFetch;
});

describe("marcar un corte como pagado", () => {
	test("no dispara el PATCH hasta que se confirma, y el diálogo nombra el importe", async () => {
		stubFetch(200, { ...pendingPayout, status: "paid" });
		renderActionsCell(pendingPayout);

		fireEvent.click(payButton());

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("¿Marcar el corte como pagado?");
		expect(dialog.textContent).toContain("Café Central");
		expect(dialog.textContent).toContain("$120.00");
		expect(dialog.textContent).toContain("no se puede deshacer");
		expect(fetchCalls).toHaveLength(0);

		fireEvent.click(screen.getByRole("button", { name: /Marcar pagado/ }));

		await waitFor(() => expect(fetchCalls).toHaveLength(1));
		expect(fetchCalls[0]?.url).toContain(`/payouts/${pendingPayout.id}/pay`);
		expect(fetchCalls[0]?.method).toBe("PATCH");
	});

	test("cancelar no llama a la API", async () => {
		stubFetch(200, pendingPayout);
		renderActionsCell(pendingPayout);

		fireEvent.click(payButton());
		fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

		// El diálogo sale del árbol: solo queda el botón de la celda.
		await waitFor(() =>
			expect(
				screen.getAllByRole("button", { name: /Marcar pagado/ }),
			).toHaveLength(1),
		);
		expect(fetchCalls).toHaveLength(0);
	});

	test("no ofrece la acción en un corte que ya no está pendiente", () => {
		stubFetch(200, pendingPayout);
		renderActionsCell({ ...pendingPayout, status: "paid" });

		expect(screen.queryByRole("button", { name: /Marcar pagado/ })).toBeNull();
	});
});

describe("estado del corte", () => {
	// A12: `paid` / `failed` crudos en una tabla de dinero son ruido para el operador.
	test("se muestra en español", () => {
		renderStatusCell({ ...pendingPayout, status: "paid" });
		expect(screen.getByText("Pagado")).toBeDefined();
		expect(screen.queryByText("paid")).toBeNull();
	});

	test("traduce un fallo de pago", () => {
		renderStatusCell({ ...pendingPayout, status: "failed" });
		expect(screen.getByText("Fallido")).toBeDefined();
		expect(screen.queryByText("failed")).toBeNull();
	});
});
