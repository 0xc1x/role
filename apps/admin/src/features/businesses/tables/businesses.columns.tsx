import type { BusinessDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { ActiveCell } from "@/components/data-table/cells/active-cell";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { useUpdateBusiness } from "@/features/businesses/queries/businesses.queries";
import { ActionCell } from "@/features/businesses/tables/cells/action-cell";

const VerificationBadge = ({ status }: { status: string }) => {
	const variant =
		status === "approved"
			? "default"
			: status === "pending"
				? "secondary"
				: "destructive";
	const color =
		status === "approved"
			? "bg-green-500/10 text-green-600 border-green-200"
			: status === "pending"
				? "bg-amber-500/10 text-amber-600 border-amber-200"
				: "bg-red-500/10 text-red-600 border-red-200";
	return (
		<Badge variant={variant} className={color}>
			{status}
		</Badge>
	);
};

const ActiveCellWrapper = ({ row }: { row: { original: BusinessDto } }) => {
	const updateMutation = useUpdateBusiness();
	return (
		<ActiveCell
			active={row.original.is_active}
			onToggle={(checked) =>
				updateMutation.mutate({
					id: row.original.id,
					body: { is_active: checked },
				})
			}
			isPending={updateMutation.isPending}
			label="Negocio"
		/>
	);
};

export const columns: ColumnDef<BusinessDto>[] = [
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Negocio" />
		),
		cell: ({ row }) => (
			<div className="font-medium">{row.getValue("name")}</div>
		),
	},
	{
		accessorKey: "type",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Tipo" />
		),
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{row.getValue("type")}
			</span>
		),
	},
	{
		accessorKey: "verification_status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Estado" />
		),
		cell: ({ row }) => (
			<VerificationBadge status={row.getValue("verification_status")} />
		),
	},
	{
		accessorKey: "is_active",
		header: "Activo",
		cell: ({ row }) => <ActiveCellWrapper row={row} />,
	},
	{
		accessorKey: "created_at",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Creado" />
		),
		cell: ({ row }) => {
			const v = row.getValue("created_at") as string;
			return (
				<span className="text-sm text-muted-foreground">
					{new Date(v).toLocaleDateString("es-EC")}
				</span>
			);
		},
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => <ActionCell row={row} />,
	},
];
