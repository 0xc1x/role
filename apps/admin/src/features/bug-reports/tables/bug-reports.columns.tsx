import type { BugReportListItemDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { ActionCell } from "@/features/bug-reports/tables/cells/action-cell";
import { TriageBadge } from "@/features/bug-reports/tables/cells/triage-badge";
import { entryOriginLabel } from "@/lib/labels";

const Resumen = ({ fila }: { fila: BugReportListItemDto }) => {
	if (!fila.readable) {
		// La fila se lista igual, vacía. Decirlo es mejor que mostrar "—" en cada
		// columna: el operador tiene que saber que esos datos no se pudieron leer,
		// no que la persona no mandó nada.
		return (
			<span className="text-muted-foreground text-xs">Sin datos legibles</span>
		);
	}
	return (
		<span className="font-medium text-sm break-words">
			{fila.summary || "Sin resumen"}
		</span>
	);
};

/**
 * Fábrica de columnas y no un array exportado, por el mismo motivo que la
 * bandeja de contactos: la celda de acciones necesita el `onOpen` del listado
 * para abrir el drawer. Sin la fábrica, el estado del drawer tendría que vivir
 * dentro de la celda y se cerraría al cambiar de fila.
 *
 * LO QUE NO ESTÁ ACÁ, y es una decisión del diseño (§8) y no una omisión:
 *
 *  - `reporter_id`. Es PII y esta es la superficie que se amplía de un vistazo en
 *    un monitor de soporte. Va en el detalle, que es donde el operador investiga
 *    una fila concreta. (La API además no lo manda en el listado: su mapper es
 *    una lista blanca, y el panel no lo puede pedir.)
 *  - `delivery_status`. Lo mueve el camino público de `POST /contact` cuando se
 *    ENTREGA el correo de aviso, y un reporte de errores no tiene camino de
 *    correo (D8): nadie lo mueve después del insert, así que un badge acá sería
 *    un "Entrega pendiente" eterno que el operador leería como una tarea
 *    pendiente que ya no existe. La columna de triaje no dice lo mismo —dice qué
 *    hizo el equipo con el reporte— y poner las dos juntas invitaría a leer una
 *    como la otra.
 */
export const createBugReportsColumns = (
	onOpen: (fila: BugReportListItemDto) => void,
): ColumnDef<BugReportListItemDto>[] => [
	{
		accessorKey: "summary",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Reporte" />
		),
		cell: ({ row }) => <Resumen fila={row.original} />,
	},
	{
		accessorKey: "origin",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Origen" />
		),
		cell: ({ row }) => (
			// `origin` es nullable: es una columna genérica de `app_store` y una
			// fila escrita por otro camino puede no nombrarla. Se dice "sin informar"
			// en vez de dejar la celda en blanco, que se lee como un dato vacío.
			<span className="text-sm">
				{row.original.origin ? entryOriginLabel(row.original.origin) : "—"}
			</span>
		),
	},
	{
		accessorKey: "state",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Triaje" />
		),
		cell: ({ row }) => <TriageBadge state={row.original.state} />,
	},
	{
		accessorKey: "created_at",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Recibido" />
		),
		cell: ({ row }) => (
			<span className="text-muted-foreground text-sm">
				{new Date(row.original.created_at).toLocaleDateString("es-EC")}
			</span>
		),
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => <ActionCell row={row} onOpen={onOpen} />,
	},
];
