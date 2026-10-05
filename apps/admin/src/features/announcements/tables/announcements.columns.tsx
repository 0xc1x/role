import type {
	AnnouncementDto,
	AnnouncementSeverity,
} from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { ActiveCell } from "@/components/data-table/cells/active-cell";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { announcementAudienceLabel } from "@/lib/labels";
import { useUpdateAnnouncement } from "../queries/announcements.queries";
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
/**
 * El switch de estado. Su propio componente porque necesita la mutación: cada
 * celda es un `useUpdateAnnouncement` propio, igual que en `tips.columns.tsx`.
 */
const ActivoCell = ({ row }: { row: { original: AnnouncementDto } }) => {
	const updateMutation = useUpdateAnnouncement();
	return (
		<ActiveCell
			active={row.original.active}
			onToggle={(checked) =>
				updateMutation.mutate({
					id: row.original.id,
					body: { active: checked },
				})
			}
			isPending={updateMutation.isPending}
			label="Aviso"
		/>
	);
};

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
		// El switch en línea, como en `tips.columns.tsx`: la baja de un aviso es la
		// operación de rutina de esta pantalla y pedir un drawer para hacerla sería
		// un costo por cada aviso que se quiera apagar.
		//
		// Un PATCH de un campo NO choca con el predicado de audiencia del service:
		// `assertAudienceHasTargets` lee `body.user_ids ?? existing.user_ids`, y en
		// un `{ active: false }` ese `body.user_ids` es `undefined`, así que el `??`
		// cae a las listas GUARDADAS y el PATCH pasa siempre que la fila sea
		// alcanzable por la API. Y una fila `specific` con las dos listas vacías no
		// lo es: `create` la rechaza, y un PATCH no la puede vaciar sin 400, porque
		// mandar las dos listas explícitamente vacías NO cae al `??` —`[]` no es
		// nullish: `[] ?? existing` da `[]` igual— y la suma da 0 → 400.
		cell: ({ row }) => <ActivoCell row={row} />,
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
