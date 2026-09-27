import { afterEach, describe, expect, test } from "bun:test";
import type { HideReviewDto } from "@0xc1x/role-commons";
import { cleanup, fireEvent, render, screen, waitFor } from "@/test-utils/dom";
import { HideReviewDialog } from "../hide-review-dialog";

/**
 * El copy de esta confirmación NO puede ser el de `ConfirmDeleteDialog`: acá no
 * se borra nada. Si el panel dijera "eliminar" o "esto no se puede deshacer"
 * sobre una acción que conserva la fila y se puede revertir desde el mismo
 * lugar, el operador estaría decidiendo sobre una consecuencia que nadie le
 * describió — y descartaría la moderación que sí se puede deshacer.
 *
 * Y el motivo DECLARADO, no una caja de texto: el token es el registro de
 * apelación, y el detalle libre es el contexto alrededor. Estos tests fijan las
 * dos mitades: el motivo es obligatorio siempre, y el detalle solo cuando el
 * motivo no se explica solo.
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

/**
 * Abre el selector de motivo y elige una opción por su etiqueta.
 *
 * La secuencia `pointerdown` + `pointerup` + `click` NO es redundante: Base UI
 * escucha eventos de puntero en los items del popup, y un `fireEvent.click` a
 * secas abre el selector pero no elige nada. Es una limitación del DOM de los
 * specs, no del componente — en un navegador real el clic del ratón produce los
 * tres. No "simplificar" esto a un solo `click`.
 */
async function elegirMotivo(etiqueta: string) {
	fireEvent.click(await screen.findByRole("combobox", { name: /Motivo/ }));
	const opcion = await screen.findByRole("option", { name: etiqueta });
	fireEvent.pointerDown(opcion, { pointerId: 1, isPrimary: true, button: 0 });
	fireEvent.pointerUp(opcion, { pointerId: 1, isPrimary: true, button: 0 });
	fireEvent.click(opcion);
}

/** El campo de detalle, cuyo rótulo lleva un asterisco cuando es obligatorio. */
const detalle = () => screen.getByLabelText(/^Detalle/) as HTMLTextAreaElement;

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

describe("el motivo es obligatorio y viene de la taxonomía", () => {
	test("el selector ofrece todos los motivos en español, no los tokens crudos", async () => {
		renderDialog();

		fireEvent.click(await screen.findByRole("combobox", { name: /Motivo/ }));

		// Las etiquetas son lo que lee la persona; el token es lo que se guarda.
		expect(
			await screen.findByRole("option", {
				name: "Insultos, acoso o lenguaje de odio",
			}),
		).toBeDefined();
		expect(
			screen.getByRole("option", {
				name: "Reseña falsa o que no corresponde a una reserva real",
			}),
		).toBeDefined();
		expect(
			screen.queryByRole("option", { name: "insults_or_hate_speech" }),
		).toBeNull();
	});

	test("sin motivo no se puede ocultar", async () => {
		const confirmados: HideReviewDto[] = [];
		renderDialog({ onConfirm: (c) => confirmados.push(c) });

		fireEvent.click(
			await screen.findByRole("button", { name: "Ocultar reseña" }),
		);

		await waitFor(() =>
			expect(
				screen.getByText("Elige el motivo por el que se oculta la reseña"),
			).toBeDefined(),
		);
		expect(confirmados).toEqual([]);
	});

	test("un motivo nombrado SIN detalle se acepta: el token ya dice por qué", async () => {
		const confirmados: HideReviewDto[] = [];
		renderDialog({ onConfirm: (c) => confirmados.push(c) });

		await elegirMotivo("Insultos, acoso o lenguaje de odio");
		fireEvent.click(screen.getByRole("button", { name: "Ocultar reseña" }));

		await waitFor(() => expect(confirmados).toHaveLength(1));
		expect(confirmados[0]).toEqual({
			moderation_reason: "insults_or_hate_speech",
		});
		// Sin detalle el `hidden_reason` no viaja: mandar "" sería afirmar que se
		// escribió una descripción que no existe.
		expect(confirmados[0]?.hidden_reason).toBeUndefined();
	});

	test("un motivo nombrado CON detalle envía el token y el detalle", async () => {
		const confirmados: HideReviewDto[] = [];
		renderDialog({ onConfirm: (c) => confirmados.push(c) });

		await elegirMotivo("Amenazas o intimidación");
		fireEvent.change(detalle(), {
			target: { value: "Mencionó llegar al local el jueves" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Ocultar reseña" }));

		await waitFor(() => expect(confirmados).toHaveLength(1));
		expect(confirmados[0]).toEqual({
			moderation_reason: "threats_or_intimidation",
			hidden_reason: "Mencionó llegar al local el jueves",
		});
	});

	test("un detalle más largo que el contrato no pasa", async () => {
		const confirmados: HideReviewDto[] = [];
		renderDialog({ onConfirm: (c) => confirmados.push(c) });

		await elegirMotivo("Insultos, acoso o lenguaje de odio");
		fireEvent.change(detalle(), {
			target: { value: "a".repeat(501) },
		});
		fireEvent.click(screen.getByRole("button", { name: "Ocultar reseña" }));

		await waitFor(() =>
			expect(
				screen.getByText("El detalle no puede superar los 500 caracteres"),
			).toBeDefined(),
		);
		expect(confirmados).toEqual([]);
	});
});

describe("el detalle solo es obligatorio para «Otro motivo»", () => {
	test("con un motivo nombrado, el detalle se anuncia como opcional", async () => {
		renderDialog();

		const ayuda = await screen.findByText(/Opcional\. El motivo elegido/);
		expect(ayuda).toBeDefined();
		expect(ayuda.textContent).toContain("ya dice por qué");
		expect(detalle().required).toBe(false);
	});

	test("al elegir «Otro motivo», el requisito se DICE, no solo se aplica", async () => {
		renderDialog();

		await elegirMotivo("Otro motivo");

		// Un requisito que solo aparece como error es un requisito que el
		// operador descubre después de escribir todo lo demás.
		expect(await screen.findByText(/Obligatorio para/)).toBeDefined();
		expect(detalle().required).toBe(true);
	});

	test("«Otro motivo» sin detalle no deja ocultar", async () => {
		const confirmados: HideReviewDto[] = [];
		renderDialog({ onConfirm: (c) => confirmados.push(c) });

		await elegirMotivo("Otro motivo");
		fireEvent.click(screen.getByRole("button", { name: "Ocultar reseña" }));

		await waitFor(() =>
			expect(
				screen.getByText(
					"«Otro motivo» no se explica solo: describe por qué se oculta la reseña",
				),
			).toBeDefined(),
		);
		expect(confirmados).toEqual([]);
	});

	test("«Otro motivo» con un detalle de solo espacios sigue sin detalle", async () => {
		const confirmados: HideReviewDto[] = [];
		renderDialog({ onConfirm: (c) => confirmados.push(c) });

		await elegirMotivo("Otro motivo");
		fireEvent.change(detalle(), {
			target: { value: "   \n  " },
		});
		fireEvent.click(screen.getByRole("button", { name: "Ocultar reseña" }));

		await waitFor(() =>
			expect(
				screen.getByText(
					"«Otro motivo» no se explica solo: describe por qué se oculta la reseña",
				),
			).toBeDefined(),
		);
		expect(confirmados).toEqual([]);
	});

	test("«Otro motivo» con detalle se acepta", async () => {
		const confirmados: HideReviewDto[] = [];
		renderDialog({ onConfirm: (c) => confirmados.push(c) });

		await elegirMotivo("Otro motivo");
		fireEvent.change(detalle(), {
			target: { value: "Habla de un producto que el local no vende" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Ocultar reseña" }));

		await waitFor(() => expect(confirmados).toHaveLength(1));
		expect(confirmados[0]).toEqual({
			moderation_reason: "other",
			hidden_reason: "Habla de un producto que el local no vende",
		});
	});

	test("volver a un motivo nombrado devuelve el detalle a opcional", async () => {
		renderDialog();

		await elegirMotivo("Otro motivo");
		expect(detalle().required).toBe(true);

		await elegirMotivo("Insultos, acoso o lenguaje de odio");
		expect(detalle().required).toBe(false);
		expect(
			await screen.findByText(/Opcional\. El motivo elegido/),
		).toBeDefined();
	});
});

describe("estado del diálogo", () => {
	test("cancelar no confirma nada", async () => {
		const confirmados: HideReviewDto[] = [];
		renderDialog({ onConfirm: (c) => confirmados.push(c) });

		await elegirMotivo("Insultos, acoso o lenguaje de odio");
		fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

		await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(2));
		expect(confirmados).toEqual([]);
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
