import type { TipDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { ActiveCell } from "@/components/data-table/cells/active-cell";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { useUpdateTip } from "@/features/tips/queries/tips.queries";
import { ActionCell } from "@/features/tips/tables/cells/action-cell";

const ActiveCellWrapper = ({ row }: { row: { original: TipDto } }) => {
	const updateMutation = useUpdateTip();
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
			label="Consejo"
		/>
	);
};

export const columns: ColumnDef<TipDto>[] = [
	{
		accessorKey: "content",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Consejo" />
		),
		cell: ({ row }) => (
			<span className="text-muted-foreground line-clamp-2 max-w-md">
				{row.getValue("content")}
			</span>
		),
	},
	{
		accessorKey: "active",
		header: "Estado",
		cell: ({ row }) => <ActiveCellWrapper row={row} />,
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => <ActionCell row={row} />,
	},
];
