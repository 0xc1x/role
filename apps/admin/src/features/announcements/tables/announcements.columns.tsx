import type {
	AnnouncementDto,
	AnnouncementSeverity,
} from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { announcementAudienceLabel } from "@/lib/labels";
import { ActionCell } from "./cells/action-cell";

const SEVERITY_LABELS: Record<AnnouncementSeverity, string> = {
	info: "Informativo",
	required: "Obligatorio",
};

/**
 * `audience_kind` alcanza para decir A QUIÉN LE TOCA, y no a cuántas personas:
 * las dos listas de un `specific` están fuera del read path a propósito, así que
 * el panel no puede contarlas. Escribir un "3 destinatarios" sería inventar el
 * dato, y por eso esta columna no tiene número.
 */
function Ventana({
	start_at,
	end_at,
}: {
	start_at: string | null;
	end_at: string | null;
}) {
	if (!start_at && !end_at) {
		return <span className="text-muted-foreground text-sm">Sin ventana</span>;
	}
	return (
		<span className="text-muted-foreground text-sm">
			{start_at ? `Desde ${start_at.slice(0, 10)}` : "Desde ya"}
			{end_at ? ` · hasta ${end_at.slice(0, 10)}` : " · sin fin"}
		</span>
	);
}

export const columns: ColumnDef<AnnouncementDto>[] = [
	{
		accessorKey: "title",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Título" />
		),
		cell: ({ row }) => (
			<div className="space-y-0.5">
				<p className="font-medium">{row.original.title}</p>
				<p className="line-clamp-2 max-w-md text-muted-foreground text-sm">
					{row.original.body}
				</p>
			</div>
		),
	},
	{
		accessorKey: "severity",
		header: "Severidad",
		cell: ({ row }) => (
			<Badge
				variant={
					row.original.severity === "required" ? "destructive" : "secondary"
				}
			>
				{SEVERITY_LABELS[row.original.severity]}
			</Badge>
		),
	},
	{
		accessorKey: "audience_kind",
		header: "Audiencia",
		cell: ({ row }) => (
			<span className="text-sm">
				{announcementAudienceLabel(row.original.audience_kind)}
			</span>
		),
	},
	{
		accessorKey: "priority",
		header: "Prioridad",
		cell: ({ row }) => (
			<span className="text-muted-foreground text-sm">
				{row.original.priority}
			</span>
		),
	},
	{
		accessorKey: "active",
		header: "Estado",
		// Badge y NO el `ActiveCell` con switch que usan tips o coupons: ese
		// control hace un PATCH de un solo campo, y el PATCH de un `specific` sin
		// destino lo rechaza el service con un 400 —el predicado lee las listas
		// guardadas, que es justamente lo que está vacío—. Con el switch, la fila
		// no cambiaría y el operador no vería nada. Se baja desde el drawer de
		// edición, que muestra el error, o con la acción de desactivar.
		cell: ({ row }) => (
			<Badge variant={row.original.active ? "success" : "destructive"}>
				{row.original.active ? "Vigente" : "Inactivo"}
			</Badge>
		),
	},
	{
		accessorKey: "start_at",
		header: "Vigencia",
		cell: ({ row }) => (
			<Ventana start_at={row.original.start_at} end_at={row.original.end_at} />
		),
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => <ActionCell row={row} />,
	},
];
