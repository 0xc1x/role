import type { EmailSendDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { ActionCell } from "@/features/email-sends/tables/cells/action-cell";

const TypeBadge = ({ type }: { type: string }) => {
	const colors: Record<string, string> = {
		campaign: "bg-blue-500/10 text-blue-600 border-blue-200",
		transactional: "bg-purple-500/10 text-purple-600 border-purple-200",
		newsletter: "bg-green-500/10 text-green-600 border-green-200",
		notification: "bg-amber-500/10 text-amber-600 border-amber-200",
		test: "bg-gray-500/10 text-gray-600",
	};
	return <Badge className={colors[type] ?? ""}>{type}</Badge>;
};

const StatusBadge = ({ status }: { status: string }) => {
	const map: Record<string, string> = {
		pending: "bg-amber-500/10 text-amber-600 border-amber-200",
		queued: "bg-blue-500/10 text-blue-600 border-blue-200",
		processing: "bg-cyan-500/10 text-cyan-600 border-cyan-200",
		sent: "bg-green-500/10 text-green-600 border-green-200",
		delivered: "bg-emerald-500/10 text-emerald-600",
		failed: "bg-red-500/10 text-red-600 border-red-200",
		cancelled: "bg-gray-500/10 text-gray-600",
		bounced: "bg-orange-500/10 text-orange-600",
	};
	return <Badge className={map[status] ?? ""}>{status}</Badge>;
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
