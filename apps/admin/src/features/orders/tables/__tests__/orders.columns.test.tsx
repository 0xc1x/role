import { afterEach, describe, expect, test } from "bun:test";
import type { AdminOrderListItemDto } from "@0xc1x/role-commons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataTable } from "@/components/data-table/data-table";
import { cleanup, render, screen } from "@/test-utils/dom";
import { ordersColumns } from "../orders.columns";

/**
 * Una orden se atiende contra lo que el consumidor dice ("me quedó comida y no
 * aparece"), así que la fila tiene que dar estado, negocio, oferta, importe y
 * ventana. Y el estado en español: `ready_for_pickup` crudo obliga a traducir
 * en la cabeza justo cuando se está mirando un problema.
 */

const order: AdminOrderListItemDto = {
	id: "11111111-1111-4111-8111-111111111111",
	order_number: "FD-2026-0101-001",
	status: "ready_for_pickup",
	business_id: "22222222-2222-4222-8222-222222222222",
	business_name: "Café Central",
	offer_id: "33333333-3333-4333-8333-333333333333",
	offer_title: "Mesa de sobrantes del lunes",
	price: 4.5,
	original_price: 19.99,
	pickup_start: "2026-09-20T15:00:00.000Z",
	pickup_end: "2026-09-20T19:00:00.000Z",
	is_stuck: false,
	created_at: "2026-09-19T10:00:00.000Z",
	updated_at: "2026-09-19T10:00:00.000Z",
};

const windowFmt = new Intl.DateTimeFormat("es-EC", {
	dateStyle: "short",
	timeStyle: "short",
});

function renderTable(data: AdminOrderListItemDto[] = [order]) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<DataTable
				columns={ordersColumns}
				data={data}
				meta={{ page: 1, limit: 10, total: data.length, total_pages: 1 }}
			/>
		</QueryClientProvider>,
	);
}

afterEach(cleanup);

describe("listado de órdenes", () => {
	test("muestra folio, negocio, oferta, importe y ventana", () => {
		renderTable();

		expect(screen.getByText("FD-2026-0101-001")).toBeDefined();
		expect(screen.getByText("Café Central")).toBeDefined();
		expect(screen.getByText("Mesa de sobrantes del lunes")).toBeDefined();
		expect(screen.getByText("$4.50")).toBeDefined();
		const expected = `${windowFmt.format(new Date(order.pickup_start))} → ${windowFmt.format(new Date(order.pickup_end))}`;
		expect(screen.getByText(expected)).toBeDefined();
	});

	// El enum crudo en una pantalla de soporte es un estado mal atendido.
	test("traduce el estado al español", () => {
		renderTable();
		expect(screen.getByText("Lista para recoger")).toBeDefined();
		expect(screen.queryByText("ready_for_pickup")).toBeNull();
	});

	test.each([
		["pending", "Pendiente"],
		["confirmed", "Confirmada"],
		["picked_up", "Recogida"],
		["completed", "Completada"],
		["cancelled", "Cancelada"],
		["expired", "Vencida"],
	] as const)("traduce %s a %s", (status, label) => {
		renderTable([{ ...order, status }]);
		expect(screen.getByText(label)).toBeDefined();
		expect(screen.queryByText(status)).toBeNull();
	});

	test("marca la orden atascada solo cuando el servidor lo dice", () => {
		const { container } = renderTable([
			order,
			{ ...order, id: "otra", is_stuck: true },
		]);
		// La insignia, no el encabezado de la columna (también dice "Atascada").
		const stuckBadges = [
			...container.querySelectorAll('[data-slot="badge"]'),
		].filter((el) => el.textContent === "Atascada");
		expect(stuckBadges).toHaveLength(1);
		expect(container.textContent).toContain("—");
	});

	test("cae al id corto del negocio cuando el join no resolvió el nombre", () => {
		renderTable([{ ...order, business_name: null }]);
		expect(screen.getByText(order.business_id.slice(0, 8))).toBeDefined();
	});

	// El operador ve órdenes atascadas y las tiene que poder desbloquear. La
	// fila ofrece el movimiento solo mientras el grafo tenga salida.
	test("ofrece cambiar estado mientras el estado tenga transiciones", () => {
		renderTable();
		expect(
			screen.getByRole("button", { name: /Cambiar estado/ }),
		).toBeDefined();
	});

	test.each([
		"completed",
		"cancelled",
		"expired",
	] as const)("no ofrece cambiar estado en un estado terminal (%s)", (status) => {
		renderTable([{ ...order, status }]);
		expect(screen.queryByRole("button", { name: /Cambiar estado/ })).toBeNull();
	});
});
