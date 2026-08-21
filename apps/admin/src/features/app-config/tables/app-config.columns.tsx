import type { AppConfigDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { ActiveCell } from "@/components/data-table/cells/active-cell";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { AppConfigEditDrawer } from "../components/app-config-edit-drawer";
import { useUpdateAppConfig } from "../queries/app-config.queries";

const ActiveCellWrapper = ({ row }: { row: { original: AppConfigDto } }) => {
	const updateMutation = useUpdateAppConfig();
	return (
		<ActiveCell
			active={row.original.active}
			onToggle={(checked) =>
				updateMutation.mutate({
					key: row.original.key,
					body: { active: checked },
				})
			}
			isPending={updateMutation.isPending}
			label="Config"
		/>
	);
};

export const columns: ColumnDef<AppConfigDto>[] = [
	{
		accessorKey: "key",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Clave" />
		),
		cell: ({ row }) => (
			<span className="font-mono text-xs">{row.original.key}</span>
		),
	},
	{
		accessorKey: "label",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Etiqueta" />
		),
	},
	{
		accessorKey: "category",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Categoría" />
		),
		cell: ({ row }) => (
			<Badge variant="secondary">{row.original.category}</Badge>
		),
	},
	{
		accessorKey: "value",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Valor" />
		),
		cell: ({ row }) => (
			<span className="max-w-56 truncate font-mono text-xs">
				{String(row.original.value)}
			</span>
		),
	},
	{
		accessorKey: "value_type",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Tipo" />
		),
	},
	{
		accessorKey: "description",
		header: "Descripción",
		cell: ({ row }) => (
			<span className="max-w-64 truncate text-muted-foreground">
				{row.original.description ?? "—"}
			</span>
		),
	},
	{
		accessorKey: "is_public",
		header: "Público",
		cell: ({ row }) => (
			<Badge variant={row.original.is_public ? "default" : "outline"}>
				{row.original.is_public ? "Sí" : "No"}
			</Badge>
		),
	},
	{
		accessorKey: "active",
		header: "Estado",
		cell: ({ row }) => <ActiveCellWrapper row={row} />,
	},
	{
		id: "actions",
		header: "",
		enableSorting: false,
		cell: ({ row }) => <AppConfigEditDrawer config={row.original} />,
	},
];
