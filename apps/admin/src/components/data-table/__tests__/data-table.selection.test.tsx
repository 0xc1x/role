import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@/test-utils/dom";
import { DataTable } from "../data-table";
import { DataTableSelectionBar } from "../selection";

type Row = { id: string; name: string; status: string };

const columns = [
	{ accessorKey: "name", header: "Negocio" },
	{ accessorKey: "status", header: "Estado" },
] as never;

const data: Row[] = [
	{ id: "b-cafe", name: "Café Central", status: "Pendiente" },
	{ id: "b-panaderia", name: "Panadería La Espiga", status: "Pendiente" },
];

/** Las mismas dos filas, en el orden inverso: lo que devuelve un refetch. */
const dataReordered: Row[] = [data[1] as Row, data[0] as Row];

/**
 * La barra de verdad, no una de mentira: el conteo es la única garantía visible
 * de qué va a pegar la acción, y probar un cromo que la tabla nunca monta no
 * probaría nada.
 */
function Toolbar({
	selectedRows,
	clear,
}: {
	selectedRows: Row[];
	clear: () => void;
}) {
	return (
		<DataTableSelectionBar count={selectedRows.length} onClear={clear}>
			<span>acciones</span>
		</DataTableSelectionBar>
	);
}

const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function Harness({
	rows,
	page = 1,
	limit = 10,
	total,
	canSelect,
}: {
	rows: Row[];
	page?: number;
	limit?: number;
	total?: number;
	canSelect?: (row: Row) => boolean;
}) {
	return (
		<QueryClientProvider client={queryClient}>
			<DataTable
				columns={columns}
				data={rows}
				meta={{ page, limit, total: total ?? rows.length, total_pages: 3 }}
				selection={{
					getRowId: (row: Row) => row.id,
					enableRowSelection: canSelect
						? (row) => canSelect(row.original as Row)
						: undefined,
					toolbar: (state) => (
						<Toolbar
							selectedRows={state.selectedRows as Row[]}
							clear={state.clear}
						/>
					),
				}}
			/>
		</QueryClientProvider>
	);
}

/** La fila como la ve el operador: por su texto, no por su índice. */
function rowByName(name: string) {
	return screen.getByText(name).closest("tr") as HTMLElement;
}

function checkboxes() {
	return screen.getAllByRole("checkbox");
}

/** Con `noUncheckedIndexedAccess` en pie, "no hay casilla" debe fallar fuerte. */
function checkboxAt(index: number) {
	const element = checkboxes()[index];
	if (!element) throw new Error(`No hay casilla en la posición ${index}`);
	return element;
}

afterEach(cleanup);

describe("DataTable con selección", () => {
	// Este es EL test de la nota que dejó el autor anterior. Con `manualPagination`
	// y sin `getRowId`, TanStack indexa las filas por posición: lo guardado es
	// "0" y al reordenar el servidor marcaría la fila que pasó al índice 0 —
	// otra negocio, otro id, otra acción. La fila marcada tiene que seguir siendo
	// la MISMA fila, no la del mismo índice.
	test("getRowId ata la selección a la fila, no a su posición", () => {
		const { rerender } = render(<Harness rows={data} />);

		// Marca la primera fila ("Café Central").
		fireEvent.click(checkboxAt(1));
		expect(screen.getByText("1 fila seleccionada")).toBeTruthy();
		expect(rowByName("Café Central").dataset.state).toBe("selected");

		// El servidor reordena las mismas dos filas.
		rerender(<Harness rows={dataReordered} />);

		// La selección sigue siendo la de "Café Central", ahora en la segunda
		// posición. Si fuera por índice, la marca habría saltado a la panadería.
		expect(rowByName("Café Central").dataset.state).toBe("selected");
		expect(rowByName("Panadería La Espiga").dataset.state).not.toBe("selected");
		expect(screen.getByText("1 fila seleccionada")).toBeTruthy();
	});

	// `getRowId` evita la fila equivocada, pero no el alcance opaco: con la página
	// cambiada, un "8 seleccionadas" sobre filas que no están a la vista es una
	// acción cuyo alcance el operador no puede enunciar. Se borra.
	test("la selección se borra al cambiar de página", () => {
		const { rerender } = render(<Harness rows={data} />);
		fireEvent.click(checkboxAt(1));
		expect(screen.getByText("1 fila seleccionada")).toBeTruthy();

		rerender(
			<Harness
				rows={[{ id: "b-otro", name: "Otro Negocio", status: "Pendiente" }]}
				page={2}
				total={30}
			/>,
		);

		expect(screen.queryByText("1 fila seleccionada")).toBeNull();
		expect(rowByName("Otro Negocio").dataset.state).not.toBe("selected");
	});

	test("la selección se borra al cambiar el tamaño de página", () => {
		const { rerender } = render(<Harness rows={data} />);
		fireEvent.click(checkboxAt(1));

		rerender(<Harness rows={data} limit={20} total={30} />);

		expect(screen.queryByText("1 fila seleccionada")).toBeNull();
	});

	test("la selección se borra cuando el conjunto de filas en pantalla cambia", () => {
		const { rerender } = render(<Harness rows={data} />);
		fireEvent.click(checkboxAt(1));
		expect(screen.getByText("1 fila seleccionada")).toBeTruthy();

		// Misma página, pero otro filtro trajo otro negocio.
		rerender(
			<Harness
				rows={[{ id: "b-otro", name: "Otro Negocio", status: "Pendiente" }]}
			/>,
		);

		expect(screen.queryByText("1 fila seleccionada")).toBeNull();
		expect(rowByName("Otro Negocio").dataset.state).not.toBe("selected");
	});

	test("el dominio puede dejar filas fuera de la selección", () => {
		render(
			<Harness
				rows={[
					{ id: "b-pendiente", name: "Pendiente", status: "Pendiente" },
					{ id: "b-aprobado", name: "Aprobado", status: "Aprobado" },
				]}
				canSelect={(row) => row.status === "Pendiente"}
			/>,
		);

		// [0] es la de encabezado, [1] la fila pendiente y [2] la ya aprobada.
		expect(checkboxAt(2).getAttribute("aria-disabled")).toBe("true");
		expect(checkboxAt(1).getAttribute("aria-disabled")).toBeNull();

		// Y la casilla de encabezado solo cubre las seleccionables: "marcar todo"
		// no puede arrastrar a la fila que el dominio excluyó.
		fireEvent.click(checkboxAt(0));
		expect(screen.getByText("1 fila seleccionada")).toBeTruthy();
	});

	test("la casilla de encabezado marca todas las filas de la página", () => {
		render(<Harness rows={data} />);

		fireEvent.click(checkboxAt(0));

		expect(screen.getByText("2 filas seleccionadas")).toBeTruthy();
		expect(rowByName("Café Central").dataset.state).toBe("selected");
		expect(rowByName("Panadería La Espiga").dataset.state).toBe("selected");
	});

	test("la barra ofrece la salida de la selección", () => {
		render(<Harness rows={data} />);
		fireEvent.click(checkboxAt(1));
		expect(screen.getByText("1 fila seleccionada")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Limpiar selección" }));

		expect(screen.queryByText("1 fila seleccionada")).toBeNull();
		expect(rowByName("Café Central").dataset.state).not.toBe("selected");
	});
});

describe("DataTable sin selección", () => {
	// Backward compatibility: veinte dominios usan `DataTable` sin `selection`. Si
	// al opt-in se les colara una columna, un checkbox o un texto, la regresión
	// sería silenciosa y masiva.
	test("una tabla que no opta por selección renderiza exactamente igual", () => {
		render(
			<QueryClientProvider client={queryClient}>
				<DataTable
					columns={columns}
					data={data}
					meta={{ page: 1, limit: 10, total: 2, total_pages: 1 }}
				/>
			</QueryClientProvider>,
		);

		expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
		expect(screen.queryByText(/seleccionadas?/i)).toBeNull();
		expect(
			document.querySelector('[data-slot="data-table-selection-bar"]'),
		).toBeNull();
		// Dos columnas del dominio, sin la de selección.
		expect(document.querySelectorAll("thead th")).toHaveLength(2);
		expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
	});
});
