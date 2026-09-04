import type { CouponListItemDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { ActiveCell } from "@/components/data-table/cells/active-cell";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { useUpdateCoupon } from "@/features/coupons/queries/coupons.queries";
import { ActionCell } from "@/features/coupons/tables/cells/action-cell";

const ActiveCellWrapper = ({
	row,
}: {
	row: { original: CouponListItemDto };
}) => {
	const updateMutation = useUpdateCoupon();
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
			label="Cupón"
		/>
	);
};

const currency = new Intl.NumberFormat("es-MX", {
	style: "currency",
	currency: "MXN",
});

function formatCouponValue(coupon: CouponListItemDto): string {
	return coupon.type === "percentage"
		? `${coupon.value}%`
		: currency.format(coupon.value);
}

function formatExpiry(iso: string | null): string {
	if (!iso) return "—";
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "—";
	return date.toLocaleDateString("es-MX", {
		day: "2-digit",
		month: "short",
		year: "numeric",
	});
}

export const columns: ColumnDef<CouponListItemDto>[] = [
	{
		accessorKey: "code",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Código" />
		),
		cell: ({ row }) => (
			<code className="text-xs bg-muted px-1.5 py-0.5 rounded">
				{row.getValue("code")}
			</code>
		),
	},
	{
		accessorKey: "name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Nombre" />
		),
		cell: ({ row }) => (
			<span className="font-medium">{row.getValue("name")}</span>
		),
	},
	{
		accessorKey: "value",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Descuento" />
		),
		cell: ({ row }) => formatCouponValue(row.original),
	},
	{
		accessorKey: "min_order_amount",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Mínimo" />
		),
		cell: ({ row }) => {
			const min = row.original.min_order_amount;
			return (
				<span className="text-muted-foreground">
					{min != null ? currency.format(min) : "—"}
				</span>
			);
		},
	},
	{
		id: "usage",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Uso" />
		),
		cell: ({ row }) => {
			const { used_count, max_uses } = row.original;
			return (
				<span className="text-muted-foreground tabular-nums">
					{used_count}
					{max_uses != null ? ` / ${max_uses}` : ""}
				</span>
			);
		},
	},
	{
		id: "scope",
		header: "Ámbito",
		cell: ({ row }) => {
			const { business_id, business_name } = row.original;
			if (business_id === null) {
				return (
					<Badge className="bg-emerald-500/10 text-emerald-600">Global</Badge>
				);
			}
			return (
				<span className="text-muted-foreground">
					{business_name ?? "Negocio"}
				</span>
			);
		},
	},
	{
		accessorKey: "expires_at",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Vence" />
		),
		cell: ({ row }) => (
			<span className="text-muted-foreground">
				{formatExpiry(row.original.expires_at)}
			</span>
		),
	},
	{
		accessorKey: "is_active",
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
