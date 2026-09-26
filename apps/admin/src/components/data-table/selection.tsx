import type { ColumnDef, Row, Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/** Id de la columna de selección que `DataTable` antepone cuando se opta por ella. */
export const SELECT_COLUMN_ID = "_select";

/** Lo que la barra de acciones en lote recibe de la tabla. */
export interface DataTableSelectionState<TData> {
	/**
	 * Filas seleccionadas de la PÁGINA VISIBLE, en el orden en que se ven.
	 *
	 * Viene del modelo de filas y no del estado crudo: una fila que desapareció
	 * del servidor (la aprobó otro operador, un corte la borró) sale del conteo
	 * sola, sin dejar una acción apuntando a un id que ya no existe.
	 */
	selectedRows: TData[];
	/** Vacía la selección. */
	clear: () => void;
}

/**
 * Cromo compartido de la barra de acciones en lote: el conteo y la salida.
 *
 * El texto va con `role="status"` porque el conteo es la única garantía visible
 * de qué va a pegar la acción; si un lector de pantalla no lo escucha, el
 * operador con casilla marcada y barra muda no sabe nada.
 *
 * `count === 0` no renderiza nada: la barra es consecuencia de la selección, y
 * una barra vacía permanente ocuparía la fila de todas las tablas que se
 * activaron para selección.
 */
export function DataTableSelectionBar({
	count,
	onClear,
	children,
}: {
	count: number;
	onClear: () => void;
	children: React.ReactNode;
}) {
	if (count === 0) return null;
	return (
		<div
			data-slot="data-table-selection-bar"
			className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2"
		>
			{/* `<output>` y no `<p role="status">`: mismo rol implícito, región viva
			    incluida, sin declararla a mano. */}
			<output className="text-sm font-medium">
				{count === 1 ? "1 fila seleccionada" : `${count} filas seleccionadas`}
			</output>
			<div className="flex items-center gap-2">
				{children}
				<Button variant="ghost" size="sm" onClick={onClear}>
					Limpiar selección
				</Button>
			</div>
		</div>
	);
}

/**
 * Casilla de "todas". Cubre SOLO las filas de la página que se está viendo:
 * con `manualPagination` el conjunto de la página 3 no está en memoria, y una
 * casilla que prometiera "todo el filtro" mentaría sobre lo que la tabla sabe.
 */
export function RowSelectAllCell<TData>({ table }: { table: Table<TData> }) {
	return (
		<Checkbox
			checked={table.getIsAllRowsSelected()}
			indeterminate={table.getIsSomeRowsSelected()}
			onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
			aria-label="Seleccionar todas las filas de esta página"
		/>
	);
}

/** Casilla de una fila. `getCanSelect` respeta el `enableRowSelection` del dominio. */
export function RowSelectCell<TData>({ row }: { row: Row<TData> }) {
	return (
		<Checkbox
			checked={row.getIsSelected()}
			disabled={!row.getCanSelect()}
			onCheckedChange={(checked) => row.toggleSelected(checked)}
			aria-label="Seleccionar esta fila"
		/>
	);
}

/**
 * Columna de selección que `DataTable` antepone a las del dominio.
 *
 * Vive en `components/data-table` y no en cada `*.columns.tsx` a propósito: es la
 * pieza que hace imposible una tabla con selección sin casillas, que es
 * exactamente el estado muerto que se quitó de aquí.
 */
export function selectColumn<TData>(): ColumnDef<TData, unknown> {
	return {
		id: SELECT_COLUMN_ID,
		header: ({ table }) => <RowSelectAllCell table={table} />,
		cell: ({ row }) => <RowSelectCell row={row} />,
		enableHiding: false,
		enableSorting: false,
		enableGlobalFilter: false,
	};
}
