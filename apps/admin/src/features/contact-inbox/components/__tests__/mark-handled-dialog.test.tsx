import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { MarkHandledDialog } from "../mark-handled-dialog";

/**
 * El copy de esta confirmación NO puede ser el de `ConfirmDeleteDialog`: acá no
 * se borra nada. Si el panel dijera "eliminar" sobre una acción que solo cambia
 * un estado, el operador estaría decidiendo sobre una consecuencia que nadie le
 * describió. Estos tests fijan que el diálogo nombra lo que va a pasar y a qué
 * mensaje corresponde.
 */
function renderDialog(
	overrides: Partial<Parameters<typeof MarkHandledDialog>[0]> = {},
) {
	const onConfirm = overrides.onConfirm ?? (() => undefined);
	render(
		<MarkHandledDialog
			open
			onOpenChange={() => undefined}
			isPending={false}
			nombre="Ana"
			email="ana@example.com"
			onConfirm={onConfirm}
			{...overrides}
		/>,
	);
	return { onConfirm };
}

afterEach(cleanup);

describe("confirmación de marcar como atendido", () => {
	test("nombra la acción y aclara que no borra ni contesta", async () => {
		renderDialog();

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("¿Marcar el mensaje como atendido?");
		expect(dialog.textContent).toContain("no se borra ni se contesta");
		// El copy de borrado habría dicho "no se puede deshacer"; esta acción sí
		// se puede revertir, y decirlo evita un clic reticente de más.
		expect(dialog.textContent).not.toContain("no se puede deshacer");
	});

	test("identifica a quién pertenece el mensaje", async () => {
		renderDialog();

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("Ana");
		expect(dialog.textContent).toContain("ana@example.com");
	});

	test("un mensaje sin nombre se confirma sin inventar uno", async () => {
		renderDialog({ nombre: null, email: null });

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("sin nombre");
		expect(dialog.textContent).toContain("correo sin registrar");
	});

	test("solo llama onConfirm al aceptar", async () => {
		let confirmed = 0;
		renderDialog({ onConfirm: () => confirmed++ });

		fireEvent.click(
			await screen.findByRole("button", { name: "Marcar como atendido" }),
		);

		await waitFor(() => expect(confirmed).toBe(1));
	});

	test("cancelar no marca nada", async () => {
		let confirmed = 0;
		renderDialog({ onConfirm: () => confirmed++ });

		fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));

		await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(2));
		expect(confirmed).toBe(0);
	});

	test("mientras guarda, la acción está deshabilitada", async () => {
		renderDialog({ isPending: true });

		// Con el spinner el nombre accesible incluye su "Loading".
		const confirm = await screen.findByRole("button", {
			name: /Marcar como atendido/,
		});
		expect((confirm as HTMLButtonElement).disabled).toBe(true);
		expect(
			(screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});
});
