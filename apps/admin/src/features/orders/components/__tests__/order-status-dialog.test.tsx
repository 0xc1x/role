import { afterEach, describe, expect, test } from "bun:test";
import type { AdminOrderListItemDto, OrderStatus } from "@0xc1x/role-commons";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { OrderStatusDialog } from "../order-status-dialog";

/**
 * Una transición de orden no cambia una etiqueta: devuelve stock a la oferta o
 * suma dinero al balance del negocio. La confirmación tiene que decir cuál de
 * las dos cosas va a pasar, porque después del clic ya no hay vuelta atrás.
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
	is_stuck: true,
	created_at: "2026-09-19T10:00:00.000Z",
	updated_at: "2026-09-19T10:00:00.000Z",
};

function renderDialog(
	to: OrderStatus,
	overrides: Partial<Parameters<typeof OrderStatusDialog>[0]> = {},
) {
	const onConfirm = overrides.onConfirm ?? (() => undefined);
	render(
		<OrderStatusDialog
			order={order}
			to={to}
			open
			onOpenChange={() => undefined}
			onConfirm={onConfirm}
			isPending={false}
			{...overrides}
		/>,
	);
	return { onConfirm };
}

afterEach(cleanup);

describe("confirmación de cambio de estado", () => {
	test("nombra la orden y el estado de destino", async () => {
		renderDialog("picked_up");

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("FD-2026-0101-001");
		expect(dialog.textContent).toContain("Recogida");
		expect(dialog.textContent).toContain("Lista para recoger");
	});

	// La unidad reservada sale del stock reservado y la oferta vuelve a estar
	// comprable: es el efecto por el que un cancel_massivo agota el inventario.
	test("advertir que cancelar devuelve la unidad al stock de la oferta", async () => {
		renderDialog("cancelled");

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("stock de la oferta");
		expect(dialog.textContent).toContain("disponible para la compra");
	});

	test("advertir lo mismo al expirar", async () => {
		renderDialog("expired");

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("stock de la oferta");
	});

	// Completar suma el neto de la orden al balance del negocio. Si el operador
	// no lo lee antes de confirmar, el saldo de la superficie de pagos aparece
	// inflado sin explicación.
	test("advertir que completar suma el importe neto al saldo del negocio", async () => {
		renderDialog("completed", {
			order: { ...order, status: "picked_up" },
		});

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("importe neto");
		expect(dialog.textContent).toContain("saldo del negocio");
		expect(dialog.textContent).not.toContain("stock de la oferta");
	});

	// Un estado intermedio no mueve nada: decirlo evita que el operador se
	// aplique un filtro de consecuencias que para esa transición no aplican.
	test("dice que un avance sin efectos solo cambia el estado", async () => {
		renderDialog("confirmed", { order: { ...order, status: "pending" } });

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("Solo cambia el estado");
		expect(dialog.textContent).not.toContain("saldo del negocio");
	});

	// El aviso de irreversibilidad sale del grafo: `cancelled` no tiene aristas
	// salientes, `confirmed` sí. Prometer lo contrario sería mentir.
	test("solo llama irreversible a un destino terminal", async () => {
		renderDialog("cancelled");
		const terminal = await screen.findByRole("alertdialog");
		expect(terminal.textContent).toContain("no se puede deshacer");
		cleanup();

		renderDialog("picked_up");
		const nonTerminal = await screen.findByRole("alertdialog");
		expect(nonTerminal.textContent).toContain("Se puede corregir más adelante");
		expect(nonTerminal.textContent).not.toContain("no se puede deshacer");
	});

	test("solo confirma al aceptar", async () => {
		let confirmed = 0;
		renderDialog("cancelled", { onConfirm: () => confirmed++ });

		fireEvent.click(
			await screen.findByRole("button", { name: "Mover a Cancelada" }),
		);

		await waitFor(() => expect(confirmed).toBe(1));
	});

	test("cancelar no mueve la orden", async () => {
		let confirmed = 0;
		renderDialog("cancelled", { onConfirm: () => confirmed++ });

		fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

		await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(2));
		expect(confirmed).toBe(0);
	});

	// Un doble clic sobre un cambio de stock y dinero aplicaría la transición
	// dos veces: mientras está en vuelo no se puede volver a disparar.
	test("mientras mueve, la acción está deshabilitada", async () => {
		renderDialog("cancelled", { isPending: true });

		const confirm = await screen.findByRole("button", {
			name: /Moviendo/,
		});
		expect((confirm as HTMLButtonElement).disabled).toBe(true);
		expect(
			(screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});
});
