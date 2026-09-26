import type { PaginationMeta } from "@0xc1x/role-commons";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	type Row,
	type RowSelectionState,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import * as React from "react";
import { DataTablePagination } from "@/components/data-table/pagination";
import {
	type DataTableSelectionState,
	selectColumn,
} from "@/components/data-table/selection";
import { DataTableViewOptions } from "@/components/data-table/view-options";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

/**
 * Activación explícita de la selección. AUSENTE = la tabla se comporta exactamente
 * como antes: sin casillas, sin barra y sin `getRowId`, con las filas indexadas
 * por posición como siempre.
 */
export interface DataTableSelection<TData> {
	/**
	 * Identidad estable y única de la fila. Va DENTRO de `selection` y no como
	 * prop suelta a propósito: sin ella TanStack indexa las filas por posición,
	 * así que una selección guardada apuntaría a la fila que ocupa ese índice,
	 * no a la que el operador marcó — el peor defecto posible en una acción
	 * masiva. Anidarla la hace obligatoria por el compilador.
	 */
	getRowId: (row: TData) => string;
	/**
	 * Qué filas son seleccionables. Con `manualPagination` solo se evalúan las
	 * de la página cargada, que es también la única que el operador puede ver.
	 */
	enableRowSelection?: (row: Row<TData>) => boolean;
	/**
	 * Contenido de la barra de acciones en lote.
	 *
	 * Se monta siempre que la tabla tiene selección —también con cero filas
	 * marcadas— para que el dominio pueda mantener fuera de la barra su propia
	 * superficie (el recibo de un lote fallido, un diálogo de confirmación). Si
	 * la barra se desmontara al vaciarse la selección, ese diálogo desaparecería
	 * justo en el momento de necesitarlo.
	 */
	toolbar: (state: DataTableSelectionState<TData>) => React.ReactNode;
}

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	meta?: PaginationMeta;
	onPageChange?: (page: number) => void;
	onLimitChange?: (limit: number) => void;
	selection?: DataTableSelection<TData>;
}

export function DataTable<TData, TValue>({
	columns,
	data,
	meta,
	onPageChange,
	onLimitChange,
	selection,
}: DataTableProps<TData, TValue>) {
	const [columnVisibility, setColumnVisibility] =
		React.useState<VisibilityState>({});
	const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

	// Estable para siempre: una identidad nueva en cada render haría que TanStack
	// reconstruyera la columna en cada render y perdiera su estado interno.
	const selectCol = React.useMemo(() => selectColumn<TData>(), []);
	const hasSelection = selection !== undefined;
	const tableColumns = React.useMemo(
		() => (hasSelection ? [selectCol, ...columns] : columns),
		[hasSelection, selectCol, columns],
	);

	// LA REGLA: la selección pertenece a lo que se ve. Se borra cuando cambia la
	// página, el tamaño de página o el conjunto de filas en pantalla.
	//
	// `getRowId` ya evita que una selección heredada apunte a la fila
	// equivocada, pero el problema que queda no es de puntería sino de
	// responsabilidad: con la página cambiada, un "8 seleccionadas" sobre filas
	// que ya no están a la vista es una acción cuyo alcance el operador no puede
	// enunciar. Se prefiere perder una selección a un alcance opaco. Los ids van
	// ordenados para que un simple reordenamiento del servidor no la destruya.
	const page = meta?.page ?? 1;
	const limit = meta?.limit ?? 10;
	const visibleIds = hasSelection
		? [...new Set(data.map(selection.getRowId))].sort().join("|")
		: "";

	// biome-ignore lint/correctness/useExhaustiveDependencies: `page`, `limit` y `visibleIds` no se leen, son disparadores: el efecto debe correr cuando cambian aunque el cuerpo no los use
	React.useEffect(() => {
		// Se devuelve el MISMO objeto cuando ya está vacía: un `setState({})`
		// incondicional provocaría un render extra en cada montar, incluidas las
		// tablas sin selección.
		setRowSelection((current) =>
			Object.keys(current).length === 0 ? current : {},
		);
	}, [page, limit, visibleIds]);

	const table = useReactTable({
		data,
		columns: tableColumns,
		getCoreRowModel: getCoreRowModel(),
		getRowId: selection?.getRowId,
		enableRowSelection: selection?.enableRowSelection,
		onColumnVisibilityChange: setColumnVisibility,
		onRowSelectionChange: setRowSelection,
		state: {
			columnVisibility,
			rowSelection,
		},
		manualPagination: true,
		pageCount: meta?.total_pages ?? -1,
	});

	// El modelo de filas es la fuente de verdad, no el estado crudo: una fila que
	// ya no viene del servidor sale del conteo sola, sin dejar una acción
	// apuntando a un id fantasma.
	const selectedRows = table
		.getSelectedRowModel()
		.rows.map((row) => row.original);

	return (
		<div className="w-full min-w-0 max-w-full">
			{selection
				? selection.toolbar({
						selectedRows,
						clear: () => setRowSelection({}),
					})
				: null}
			<div className="flex items-center justify-end py-4">
				<DataTableViewOptions table={table} />
			</div>
			<section
				aria-label="Tabla de resultados"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be keyboard-focusable
				tabIndex={0}
				className="h-[65vh] w-full max-w-full overflow-x-auto overflow-y-auto rounded-md border"
			>
				{/* `containerClassName` evita el segundo scroller horizontal: el
				    <section> es el único que corta, y es el que ancla el header. */}
				<Table containerClassName="overflow-x-visible">
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									return (
										<TableHead
											key={header.id}
											// Sin esto las cabeceras se van con el scroll vertical
											// y el operador pierde de vista la columna "Acciones".
											className="sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]"
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext(),
													)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow
									key={row.id}
									data-state={row.getIsSelected() && "selected"}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id}>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								{/* `tableColumns`, no `columns`: con selección hay una
							    columna más y un `colSpan` corto deja la celda de
								    "No hay datos" sin cubrir la casilla. */}
								<TableCell
									colSpan={tableColumns.length}
									className="h-24 text-center"
								>
									No hay datos
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</section>
			<DataTablePagination
				meta={meta}
				onPageChange={onPageChange}
				onLimitChange={onLimitChange}
			/>
		</div>
	);
}
