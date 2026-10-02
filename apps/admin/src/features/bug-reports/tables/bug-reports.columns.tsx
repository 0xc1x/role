import type { BugReportListItemDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { ActionCell } from "@/features/bug-reports/tables/cells/action-cell";
import { TriageBadge } from "@/features/bug-reports/tables/cells/triage-badge";
import { formatBusinessDate } from "@/lib/dates";
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
	// `excerpt` Y NO `summary`, y esta es la diferencia entre el comentario y lo
	// que hacía el código.
	//
	// El contrato dice literalmente "Extracto para la tabla" y el mapper lo
	// calcula a 160 caracteres; el listado lo leía completo y sin `line-clamp`, así
	// que una fila podía levantar la altura de la tabla con 400 caracteres y el
	// operador tenía que scrollear para llegar a la fila siguiente. Medido con el
	// componente real: `full_summary_rendered: true`,
	// `excerpt_ellipsis_rendered: false`.
	//
	// Y POR QUÉ ESTO NO CONTRADICE el criterio de commons de no truncar en
	// lectura. Ese argumento es sobre el TEXTO DEL USUARIO no perderse, y en la
	// celda no se pierde nada: el detalle muestra `summary` íntegro, que es donde
	// se lee. Las dos superficies tienen que pensarse por separado, porque si se
	// mezclan el comentario va a mentir en alguna de las dos: si la celda
	// truncara el texto y el detalle no, el operador leería un resumen cortado
	// como si el usuario hubiera escrito eso.
	return (
		<span className="line-clamp-2 font-medium text-sm break-words">
			{fila.excerpt || "Sin resumen"}
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
			// `origin` es nullable: es una columna genérica de `app_store` y una fila
			// escrita por otro camino puede no nombrarla. Se pone "—" y no se deja
			// en blanco, que se lee como un dato vacío y no como un dato que no
			// existe. "—" y no "sin informar" porque así lo hacen las demás columnas
			// del panel, y una columna que se desvía del resto obliga al operador a
			// releerla para saber si el guion significa algo distinto.
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
			// `formatBusinessDate` y no `toLocaleDateString("es-EC")` pelado. La
			// diferencia no es de formato: el formatter pelado usa la zona del
			// NAVEGADOR y el otro fija `America/Guayaquil` (ver `lib/dates.ts`). En
			// una tabla sola eso es un detalle; acá NO, porque esta sección muestra
			// el mismo instante en la fila y en el drawer, y el drawer usa el
			// formatter fijo. Con el navegador en UTC, una fila con `created_at` a
			// las 02:00Z se leía como el día 20 y la ficha decía 19 — el mismo
			// reporte con dos fechas en la misma pantalla, que es la forma más
			// rápida de que un operador dude de si abrió dos filas o una.
			<span className="text-muted-foreground text-sm">
				{formatBusinessDate(row.original.created_at)}
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
