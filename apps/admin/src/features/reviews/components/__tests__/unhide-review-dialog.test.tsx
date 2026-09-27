import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { UnhideReviewDialog } from "../unhide-review-dialog";

/**
 * Este diálogo es la operación que REVIERTE un ocultamiento, así que su copy
 * tiene que decir dos cosas que el de borrado no dice: que la acción es
 * reversible, y que el motivo registrado se conserva aunque la reseña vuelva a
 * verse. El motivo es el registro de apelación; si el operador no lo supiera
 * antes de confirmar, el negocio se entera del problema después.
 *
 * Y lo muestra en la etiqueta que el operador ya eligió, no el token: un
 * `identity_discrimination` en una confirmación no le dice nada a la persona que
 * está decidiendo.
 */
function renderDialog(
	overrides: Partial<Parameters<typeof UnhideReviewDialog>[0]> = {},
) {
	const onConfirm = overrides.onConfirm ?? (() => undefined);
	render(
		<UnhideReviewDialog
			open
			onOpenChange={() => undefined}
			isPending={false}
			authorName="Bruno"
			moderationReason="insults_or_hate_speech"
			hiddenReason="Lenguaje abusivo hacia el personal"
			onConfirm={onConfirm}
			{...overrides}
		/>,
	);
	return { onConfirm };
}

afterEach(cleanup);

describe("copy de la confirmación de volver a mostrar", () => {
	test("nombra la acción y dice que vuelve a verse y a contar", async () => {
		renderDialog();

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("¿Volver a mostrar esta reseña?");
		expect(dialog.textContent).toContain("volverá a aparecer");
		expect(dialog.textContent).toContain("promedio");
	});

	test("dice que el motivo registrado se conserva, y lo muestra con su etiqueta", async () => {
		renderDialog();

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("se conserva");
		expect(dialog.textContent).toContain("Insultos, acoso o lenguaje de odio");
		expect(dialog.textContent).toContain("Lenguaje abusivo hacia el personal");
		// El token crudo no aparece: es la clave del filtro, no el texto que se
		// le pide a alguien leer antes de decidir.
		expect(dialog.textContent).not.toContain("insults_or_hate_speech");
	});

	test("una razón nombrada sin detalle se confirma sin inventar uno", async () => {
		renderDialog({ hiddenReason: null });

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("Insultos, acoso o lenguaje de odio");
		expect(dialog.textContent).not.toContain("«»");
	});

	test("no usa el copy de borrado: esta acción no borra y sí se puede deshacer", async () => {
		renderDialog();

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).not.toContain("no se puede deshacer");
		expect(dialog.textContent).not.toContain("Eliminar");
	});

	test("sin motivo registrado lo dice, en vez de mostrar un espacio vacío", async () => {
		renderDialog({ hiddenReason: null, moderationReason: null });

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("No hay ningún motivo registrado");
	});

	test("un token que el contrato ya no conoce se muestra crudo, sin adivinar", async () => {
		renderDialog({ moderationReason: "motivo_retirado" });

		const dialog = await screen.findByRole("alertdialog");
		expect(dialog.textContent).toContain("motivo_retirado");
		expect(dialog.textContent).not.toContain("No hay ningún motivo registrado");
	});

	test("solo llama onConfirm al aceptar", async () => {
		let confirmed = 0;
		renderDialog({ onConfirm: () => confirmed++ });

		fireEvent.click(
			await screen.findByRole("button", { name: "Volver a mostrar" }),
		);

		await waitFor(() => expect(confirmed).toBe(1));
	});
});
