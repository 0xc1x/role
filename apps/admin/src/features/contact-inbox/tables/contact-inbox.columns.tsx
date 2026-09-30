import type { ContactMessageListItemDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { ActionCell } from "@/features/contact-inbox/tables/cells/action-cell";
import { StatusBadge } from "@/features/contact-inbox/tables/cells/status-badge";

const Nombre = ({ fila }: { fila: ContactMessageListItemDto }) => {
	if (!fila.readable) {
		// La fila se lista igual, vacía. Decirlo es mejor que mostrar "—" en
		// cada columna: el operador tiene que saber que esos datos no se pudieron
		// leer, no que la persona no los mandó.
		return (
			<span className="text-muted-foreground text-xs">Sin datos legibles</span>
		);
	}
	return (
		<span className="font-medium text-sm break-words">
			{fila.name || "Sin nombre"}
		</span>
	);
};

/**
 * Fábrica de columnas y no un array exportado: la celda de acciones necesita
 * el `onOpen` del listado para abrir el drawer. Sin la fábrica, el estado del
 * drawer tendría que vivir dentro de la celda y el drawer se cerraría al
 * cambiar de fila.
 */
export const createContactInboxColumns = (
	onOpen: (fila: ContactMessageListItemDto) => void,
): ColumnDef<ContactMessageListItemDto>[] => [
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Nombre" />
		),
		cell: ({ row }) => <Nombre fila={row.original} />,
	},
	{
		accessorKey: "email",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Correo" />
		),
		cell: ({ row }) => (
			<span className="break-all text-sm">{row.original.email ?? "—"}</span>
		),
	},
	{
		accessorKey: "role",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Rol" />
		),
		cell: ({ row }) => (
			<span className="text-muted-foreground text-sm">
				{row.original.role ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "city",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Ciudad" />
		),
		cell: ({ row }) => (
			<span className="text-sm">{row.original.city ?? "—"}</span>
		),
	},
	{
		accessorKey: "excerpt",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Mensaje" />
		),
		cell: ({ row }) => (
			<span className="line-clamp-2 text-muted-foreground text-sm">
				{row.original.excerpt ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Estado" />
		),
		cell: ({ row }) => <StatusBadge status={row.original.status} />,
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
