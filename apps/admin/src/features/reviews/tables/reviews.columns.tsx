import type { ReviewModerationItemDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { ReviewActionCell } from "@/features/reviews/tables/cells/action-cell";

/**
 * El puntaje que se muestra es el que la persona dejó, y el orden de las columnas
 * lo dice: primero quién escribió, después qué escribió, y recién entonces el
 * número. La moderación se decide leyendo la reseña, no mirando la estrella.
 */
const Puntaje = ({ fila }: { fila: ReviewModerationItemDto }) => {
	const valor = fila.business_rating ?? fila.product_rating ?? fila.rating;
	if (valor == null) {
		return <span className="text-muted-foreground text-sm">Sin puntaje</span>;
	}
	return <span className="font-medium text-sm">{valor} / 5</span>;
};

/**
 * "Oculta" y no "Eliminada": la fila sigue existiendo y se puede revertir. La
 * etiqueta de la columna lo deja claro antes de que el operador tenga que
 * asumirlo, porque toda la diferencia entre esta superficie y un borrado está
 * en esa palabra.
 */
export const EstadoBadge = ({ fila }: { fila: ReviewModerationItemDto }) => (
	<Badge variant={fila.is_hidden ? "destructive" : "success"}>
		{fila.is_hidden ? "Oculta" : "Visible"}
	</Badge>
);

export const createReviewModerationColumns = (
	onHide: (fila: ReviewModerationItemDto) => void,
	onUnhide: (fila: ReviewModerationItemDto) => void,
): ColumnDef<ReviewModerationItemDto>[] => [
	{
		accessorKey: "author_name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Autor" />
		),
		cell: ({ row }) => (
			<span className="font-medium text-sm break-words">
				{row.original.author_name ?? "Sin nombre"}
			</span>
		),
	},
	{
		accessorKey: "comment",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Reseña" />
		),
		cell: ({ row }) => (
			<span className="line-clamp-3 text-muted-foreground text-sm">
				{row.original.comment ?? "Sin comentario"}
			</span>
		),
	},
	{
		accessorKey: "business_rating",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Puntaje" />
		),
		cell: ({ row }) => <Puntaje fila={row.original} />,
	},
	{
		accessorKey: "business_name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Negocio" />
		),
		cell: ({ row }) => (
			<span className="text-sm break-words">
				{row.original.business_name ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "is_hidden",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Estado" />
		),
		cell: ({ row }) => <EstadoBadge fila={row.original} />,
	},
	{
		id: "moderation",
		header: "Moderación",
		enableSorting: false,
		cell: ({ row }) => {
			const { moderated_by_name, moderated_at, hidden_reason } = row.original;
			if (!moderated_at) {
				return (
					<span className="text-muted-foreground text-sm">Sin moderar</span>
				);
			}
			return (
				<span className="block text-xs break-words">
					<span className="block">
						{moderated_by_name ?? "Cuenta eliminada"} ·{" "}
						{new Date(moderated_at).toLocaleString("es-EC")}
					</span>
					{/* El motivo sobrevive al desocultamiento a propósito: es el registro
					    de apelación, y esta celda lo muestra también en las visibles. */}
					{hidden_reason ? (
						<span className="text-muted-foreground block">
							Motivo: {hidden_reason}
						</span>
					) : null}
				</span>
			);
		},
	},
	{
		accessorKey: "created_at",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Recibida" />
		),
		cell: ({ row }) => (
			<span className="text-muted-foreground text-sm">
				{new Date(row.original.created_at).toLocaleString("es-EC")}
			</span>
		),
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => (
			<ReviewActionCell row={row} onHide={onHide} onUnhide={onUnhide} />
		),
	},
];
