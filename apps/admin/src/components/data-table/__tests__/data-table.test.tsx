import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@/test-utils/dom";
import { DataTable } from "../data-table";

type Row = { name: string; status: string };

const columns = [
	{ accessorKey: "name", header: "Negocio" },
	{ accessorKey: "status", header: "Estado" },
] as never;

const data: Row[] = [
	{ name: "Café Central", status: "Pendiente" },
	{ name: "Panadería La Espiga", status: "Aprobado" },
];

function renderTable() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<DataTable
				columns={columns}
				data={data}
				meta={{ page: 1, limit: 10, total: 2, total_pages: 1 }}
			/>
		</QueryClientProvider>,
	);
}

afterEach(cleanup);

describe("DataTable", () => {
	// A8: en una lista larga las cabeceras se iban con el scroll vertical y el
	// operador perdía de vista la columna "Acciones" justo cuando la necesita.
	test("el header es sticky dentro del contenedor con scroll", () => {
		renderTable();

		const section = screen.getByLabelText("Tabla de resultados");
		const head = section.querySelector("thead th");
		expect(head?.className).toContain("sticky");
		expect(head?.className).toContain("top-0");
		// Sin fondo las celdas se transparentan al pasar por debajo.
		expect(head?.className).toContain("bg-background");
		expect(section.className).toContain("overflow-y-auto");
	});

	// Dos scrollers horizontales anidados = doble scrollbar en viewport angosto y
	// la columna de acciones queda fuera de alcance.
	test("hay un solo scroller horizontal", () => {
		renderTable();

		const horizontalScrollers = Array.from(
			document.querySelectorAll<HTMLElement>('[data-slot="table-container"]'),
		);
		expect(horizontalScrollers).toHaveLength(1);
		expect(horizontalScrollers[0]?.className).toContain("overflow-x-visible");

		const section = screen.getByLabelText("Tabla de resultados");
		expect(section.className).toContain("overflow-x-auto");
	});

	// A16: `rowSelection` era estado muerto. Sin selección no puede quedar rastro
	// de checkboxes ni de una toolbar de acciones en lote a medio construir.
	test("no renderiza controles de selección de fila", () => {
		renderTable();

		expect(document.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
		expect(screen.queryByText(/seleccionados?/i)).toBeNull();
	});
});
