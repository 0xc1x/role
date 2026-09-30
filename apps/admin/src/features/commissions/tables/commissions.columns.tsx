import type { CommissionDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { ActionCell } from "@/features/commissions/tables/cells/action-cell";
import type { CsvColumn } from "@/lib/csv";

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
			<Badge variant={row.original.active ? "success" : "destructive"}>
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

/**
 * Exportación de comisiones, en el mismo orden que las columnas de arriba.
 *
 * La tasa se exporta en puntos (15 = 15%) y no como `0.15` con `%` detrás: el
 * símbolo lo vuelve texto en la hoja y el operador deja de poder comparar
 *commissiones entre negocios. El `id` de la columna dice que la unidad es
 * porcentaje, que es la duda que aparece al abrir el archivo.
 */
export const commissionsCsvColumns: CsvColumn<CommissionDto>[] = [
	{ label: "Negocio", value: (c) => c.name },
	{ label: "Slug", value: (c) => c.slug },
	{
		label: "Comisión (%)",
		value: (c) => Number((c.commission_rate * 100).toFixed(2)),
	},
	{ label: "Estado", value: (c) => (c.active ? "Activo" : "Inactivo") },
	{
		label: "Pagos pendientes",
		value: (c) => (c.has_pending_payouts ? "Sí" : "No"),
	},
];
