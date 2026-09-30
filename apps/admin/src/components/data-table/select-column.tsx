import type { ColumnDef } from "@tanstack/react-table";
import {
	RowSelectAllCell,
	RowSelectCell,
} from "@/components/data-table/selection";

/** Id de la columna de selección que `DataTable` antepone cuando se opta por ella. */
export const SELECT_COLUMN_ID = "_select";

/**
 * Columna de selección que `DataTable` antepone a las del dominio.
 *
 * Vive junto a `DataTable` y no en cada `*.columns.tsx` a propósito: es la
 * pieza que hace imposible una tabla con selección sin casillas, que es
 * exactamente el estado muerto que se quitó de aquí.
 *
 * Separate de `selection.tsx` porque es CONFIGURACIÓN de tabla, no cromo: el
 * archivo de las casillas queda exporting solo componentes y puede refrescar en
 * caliente sin invalidar el estado de la barra.
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
