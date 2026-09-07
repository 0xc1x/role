import type { EmailSendDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { ActionCell } from "@/features/email-sends/tables/cells/action-cell";

const TypeBadge = ({ type }: { type: string }) => {
	const variants: Record<string, "info" | "secondary" | "success" | "warning"> =
		{
			campaign: "info",
			transactional: "secondary",
			newsletter: "success",
			notification: "warning",
			test: "secondary",
		};
	return <Badge variant={variants[type] ?? "secondary"}>{type}</Badge>;
};

const StatusBadge = ({ status }: { status: string }) => {
	const map: Record<
		string,
		"info" | "secondary" | "success" | "warning" | "destructive"
	> = {
		pending: "warning",
		queued: "info",
		processing: "info",
		sent: "success",
		delivered: "success",
		failed: "destructive",
		cancelled: "secondary",
		bounced: "warning",
	};
	return <Badge variant={map[status] ?? "secondary"}>{status}</Badge>;
};

export const columns: ColumnDef<EmailSendDto>[] = [
	{
		accessorKey: "type",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Tipo" />
		),
		cell: ({ row }) => <TypeBadge type={row.getValue("type")} />,
	},
	{
		accessorKey: "source_type",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Origen" />
		),
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{(row.getValue("source_type") as string) ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "email",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Email" />
		),
		cell: ({ row }) => (
			<span className="text-sm font-medium">{row.getValue("email")}</span>
		),
	},
	{
		accessorKey: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Estado" />
		),
		cell: ({ row }) => <StatusBadge status={row.getValue("status")} />,
	},
	{
		accessorKey: "attempts",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Intentos" />
		),
		cell: ({ row }) => (
			<span className="text-sm">
				{String(row.original.attempts)}/{String(row.original.max_attempts)}
			</span>
		),
	},
	{
		accessorKey: "created_at",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Creado" />
		),
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{new Date(row.getValue("created_at") as string).toLocaleDateString(
					"es-EC",
				)}
			</span>
		),
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => <ActionCell row={row} />,
	},
];
