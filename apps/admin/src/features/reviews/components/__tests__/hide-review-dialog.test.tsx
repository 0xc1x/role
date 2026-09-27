import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { HideReviewDialog } from "../hide-review-dialog";

/**
 * El copy de esta confirmación NO puede ser el de `ConfirmDeleteDialog`: acá no
 * se borra nada. Si el panel dijera "eliminar" o "esto no se puede deshacer"
 * sobre una acción que conserva la fila y se puede revertir desde el mismo
 * lugar, el operador estaría decidiendo sobre una consecuencia que nadie le
 * describió — y descartaría la moderación que sí se puede deshacer.
 *
 * Y el motivo obligatorio: es el registro de apelación. Estos tests fijan las dos
 * cosas.
 */
function renderDialog(
	overrides: Partial<Parameters<typeof HideReviewDialog>[0]> = {},
) {
	const onConfirm = overrides.onConfirm ?? (() => undefined);
	render(
		<HideReviewDialog
			open
			onOpenChange={() => undefined}
			isPending={false}
			authorName="Bruno"
			businessName="Panadería Sur"
			comment="Pésimo, no volvamos"
			onConfirm={onConfirm}
			{...overrides}
		/>,
	);
	return { onConfirm };
}

afterEach(cleanup);

describe("copy de la confirmación de ocultar", () => {
	test("nombra la acción y aclara que no borra", async () => {
		renderDialog();

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("¿Ocultar esta reseña?");
		expect(dialog.textContent).toContain("No se borra");
		expect(dialog.textContent).toContain("se puede revertir");
	});

	test("no dice que no se puede deshacer: sí se puede", async () => {
		renderDialog();

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).not.toContain("no se puede deshacer");
		expect(dialog.textContent).not.toContain("Eliminar");
	});

	test("identifica la reseña que se va a ocultar", async () => {
		renderDialog();

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("Bruno");
		expect(dialog.textContent).toContain("Pésimo, no volvamos");
		expect(dialog.textContent).toContain("Panadería Sur");
	});

	test("una reseña sin autor ni comentario se confirma sin inventar nada", async () => {
		renderDialog({
			authorName: null,
			businessName: null,
			comment: null,
		});

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("una persona sin nombre");
		expect(dialog.textContent).not.toContain("null");
	});
});

describe("el motivo es obligatorio", () => {
	test("exige el motivo antes de dejar ocultar", async () => {
		const confirmed: string[] = [];
		renderDialog({ onConfirm: (r: string) => confirmed.push(r) });

		fireEvent.click(
			await screen.findByRole("button", { name: "Ocultar reseña" }),
		);

		await waitFor(() =>
			expect(
				screen.getByText(
					"El motivo no puede estar vacío: es el registro de apelación",
				),
			).toBeDefined(),
		);
		expect(confirmed).toEqual([]);
	});

	test("un motivo de solo espacios no cuenta como motivo", async () => {
		const confirmed: string[] = [];
		renderDialog({ onConfirm: (r: string) => confirmed.push(r) });

		fireEvent.change(await screen.findByLabelText("Motivo del ocultamiento"), {
			target: { value: "    " },
		});
		fireEvent.click(screen.getByRole("button", { name: "Ocultar reseña" }));

		await waitFor(() =>
			expect(
				screen.getByText(
					"El motivo no puede estar vacío: es el registro de apelación",
				),
			).toBeDefined(),
		);
		expect(confirmed).toEqual([]);
	});

	test("un motivo más largo que el contrato no pasa", async () => {
		const confirmed: string[] = [];
		renderDialog({ onConfirm: (r: string) => confirmed.push(r) });

		fireEvent.change(await screen.findByLabelText("Motivo del ocultamiento"), {
			target: { value: "a".repeat(501) },
		});
		fireEvent.click(screen.getByRole("button", { name: "Ocultar reseña" }));

		await waitFor(() =>
			expect(
				screen.getByText("El motivo no puede superar los 500 caracteres"),
			).toBeDefined(),
		);
		expect(confirmed).toEqual([]);
	});

	test("con un motivo real, confirma y lo entrega tal como se escribió", async () => {
		const confirmed: string[] = [];
		renderDialog({ onConfirm: (r: string) => confirmed.push(r) });

		fireEvent.change(await screen.findByLabelText("Motivo del ocultamiento"), {
			target: { value: "Lenguaje abusivo hacia el personal" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Ocultar reseña" }));

		await waitFor(() => expect(confirmed).toHaveLength(1));
		// El `.trim()` es del contrato (`HideReviewSchema`) y lo aplica el servidor:
		// el panel no reescribe lo que el operador escribió.
		expect(confirmed[0]).toBe("Lenguaje abusivo hacia el personal");
	});
});

describe("estado del diálogo", () => {
	test("cancelar no confirma nada", async () => {
		const confirmed: string[] = [];
		renderDialog({ onConfirm: (r: string) => confirmed.push(r) });

		fireEvent.change(await screen.findByLabelText("Motivo del ocultamiento"), {
			target: { value: "Lenguaje abusivo" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

		await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(2));
		expect(confirmed).toEqual([]);
	});

	test("mientras guarda, la acción está deshabilitada", async () => {
		renderDialog({ isPending: true });

		// Con el spinner el nombre accesible incluye su "Loading".
		const confirm = await screen.findByRole("button", {
			name: /Ocultar reseña/,
		});
		expect((confirm as HTMLButtonElement).disabled).toBe(true);
		expect(
			(screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});
});
