import type { PaginationMeta } from "@0xc1x/role-commons";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
	type VisibilityState,
} from "@tanstack/react-table";
import * as React from "react";
import { DataTablePagination } from "@/components/data-table/pagination";
import { DataTableViewOptions } from "@/components/data-table/view-options";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	meta?: PaginationMeta;
	onPageChange?: (page: number) => void;
	onLimitChange?: (limit: number) => void;
}

export function DataTable<TData, TValue>({
	columns,
	data,
	meta,
	onPageChange,
	onLimitChange,
}: DataTableProps<TData, TValue>) {
	const [columnVisibility, setColumnVisibility] =
		React.useState<VisibilityState>({});

	// `rowSelection` se eliminó a propósito: era estado muerto (ninguna columna
	// declara `enableRowSelection` ni hay toolbar de acciones en lote). Con
	// `manualPagination` y sin `getRowId` las filas se indexan por posición, así
	// que una selección heredada de la página anterior apuntaría a la fila
	// equivocada — el peor defecto posible en una acción masiva. Para habilitar
	// selección hay que añadir `getRowId` y una toolbar con acciones ya
	// existentes y confirmadas, no solo una casilla.
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		onColumnVisibilityChange: setColumnVisibility,
		state: {
			columnVisibility,
		},
		manualPagination: true,
		pageCount: meta?.total_pages ?? -1,
	});

	return (
		<div className="w-full min-w-0 max-w-full">
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
								<TableCell
									colSpan={columns.length}
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
