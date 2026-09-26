import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { GeneratePayoutsDialog } from "../generate-payouts-dialog";

/**
 * A7: generar cortes es una acción de dinero. La confirmación tiene que nombrar
 * qué va a hacer, no ser un "¿seguro?" genérico.
 */
function renderDialog(
	overrides: Partial<Parameters<typeof GeneratePayoutsDialog>[0]> = {},
) {
	const onConfirm = overrides.onConfirm ?? (() => undefined);
	render(
		<GeneratePayoutsDialog
			open
			onOpenChange={() => undefined}
			isPending={false}
			onConfirm={onConfirm}
			{...overrides}
		/>,
	);
	return { onConfirm };
}

afterEach(cleanup);

describe("confirmación de generar cortes", () => {
	test("nombra la acción y advierte que no se puede deshacer", async () => {
		renderDialog();

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("¿Generar los cortes del período?");
		expect(dialog.textContent).toContain("corte pendiente por cada negocio");
		expect(dialog.textContent).toContain("no se puede deshacer");
	});

	test("solo llama onConfirm al aceptar", async () => {
		let confirmed = 0;
		renderDialog({ onConfirm: () => confirmed++ });

		fireEvent.click(
			await screen.findByRole("button", { name: "Generar cortes" }),
		);

		await waitFor(() => expect(confirmed).toBe(1));
	});

	test("cancelar no genera nada", async () => {
		let confirmed = 0;
		renderDialog({ onConfirm: () => confirmed++ });

		fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

		await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(2));
		expect(confirmed).toBe(0);
	});

	test("mientras genera, la acción está deshabilitada", async () => {
		renderDialog({ isPending: true });

		// Con el spinner el nombre accesible incluye su "Loading".
		const confirm = await screen.findByRole("button", {
			name: /Generar cortes/,
		});
		expect((confirm as HTMLButtonElement).disabled).toBe(true);
		expect(
			(screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});
});
