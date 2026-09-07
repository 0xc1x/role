import { afterEach, describe, expect, jest, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@/test-utils/dom";
import { FormDrawer } from "../form-drawer";

afterEach(() => {
	cleanup();
});

function setup(onSubmit: (payload: { name: string }) => Promise<unknown>) {
	return render(
		<FormDrawer
			title="Nueva plantilla"
			createLabel="Crear plantilla"
			defaults={() => ({ name: "" })}
			fields={({ values, setValues }) => (
				<input
					aria-label="Nombre"
					value={values.name}
					onChange={(e) => setValues({ name: e.target.value })}
				/>
			)}
			toPayload={(v) => ({ name: v.name.trim() || "sin-nombre" })}
			onSubmit={onSubmit}
		/>,
	);
}

describe("FormDrawer", () => {
	test("envía el payload mapeado por toPayload", async () => {
		const onSubmit = jest.fn().mockResolvedValue(undefined);
		const view = setup(onSubmit);

		fireEvent.click(view.getByRole("button", { name: /crear plantilla/i }));
		fireEvent.change(view.getByLabelText("Nombre"), {
			target: { value: "  Hola  " },
		});
		fireEvent.click(view.getByRole("button", { name: /^guardar$/i }));

		await waitFor(() =>
			expect(onSubmit).toHaveBeenCalledWith({ name: "Hola" }, undefined),
		);
	});

	test("mapea valores vacíos según toPayload", async () => {
		const onSubmit = jest.fn().mockResolvedValue(undefined);
		const view = setup(onSubmit);

		fireEvent.click(view.getByRole("button", { name: /crear plantilla/i }));
		await Bun.write(
			"/tmp/dbg.txt",
			`BTNS:${(document.body.innerHTML.match(/<button/g) ?? []).length} GUARDAR:${document.body.innerHTML.includes("Guardar")} CONTAINERS:${document.body.children.length} OPEN:${(document.body.innerHTML.match(/data-open/g) ?? []).length}\n`,
		);
		fireEvent.click(view.getByRole("button", { name: /^guardar$/i }));

		await waitFor(() =>
			expect(onSubmit).toHaveBeenCalledWith({ name: "sin-nombre" }, undefined),
		);
	});
});
