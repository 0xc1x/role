import type { CommissionDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { ActionCell } from "@/features/commissions/tables/cells/action-cell";

export const columns: ColumnDef<CommissionDto>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Negocio" />
		),
		cell: ({ row }) => (
			<div className="flex flex-col">
				<span className="font-medium">{row.getValue("name")}</span>
				<code className="text-xs bg-muted px-1.5 py-0.5 rounded w-fit">
					{row.original.slug}
				</code>
			</div>
		),
	},
	{
		accessorKey: "commission_rate",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Comisión" />
		),
		cell: ({ row }) => (
			<span className="font-medium tabular-nums">
				{((row.getValue<number>("commission_rate") ?? 0) * 100).toFixed(2)}%
			</span>
		),
	},
	{
		accessorKey: "active",
		header: "Estado",
		cell: ({ row }) => (
			<Badge
				variant={row.original.active ? "default" : "destructive"}
				className={
					row.original.active ? "bg-green-500/10 text-green-600" : undefined
				}
			>
				{row.original.active ? "Activo" : "Inactivo"}
			</Badge>
		),
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => <ActionCell row={row} />,
	},
];
