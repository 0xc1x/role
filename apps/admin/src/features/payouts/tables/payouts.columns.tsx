import type { PayoutDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMarkPaid } from "@/features/payouts/queries/payouts.queries";

function PayoutStatusBadge({ status }: { status: PayoutDto["status"] }) {
	const variant =
		status === "paid"
			? "default"
			: status === "failed"
				? "destructive"
				: status === "pending"
					? "secondary"
					: "outline";
	return <Badge variant={variant}>{status}</Badge>;
}

function PayActionCell({ payout }: { payout: PayoutDto }) {
	const pay = useMarkPaid();
	if (payout.status !== "pending") return null;
	return (
		<Button
			size="sm"
			variant="outline"
			onClick={() => pay.mutate(payout.id)}
			disabled={pay.isPending}
		>
			Marcar pagado
		</Button>
	);
}

export const payoutsColumns: ColumnDef<PayoutDto>[] = [
	{
		accessorKey: "business_name",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Negocio" />
		),
		cell: ({ row }) => (
			<div className="font-medium">
				{row.original.business_name ?? row.original.business_id.slice(0, 8)}
			</div>
		),
	},
	{
		accessorKey: "period_start",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Período" />
		),
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{row.original.period_start} → {row.original.period_end}
			</span>
		),
	},
	{
		accessorKey: "gross_amount",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Bruto" />
		),
		cell: ({ row }) => (
			<div className="text-right">${row.original.gross_amount.toFixed(2)}</div>
		),
	},
	{
		accessorKey: "platform_fee",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Fee" />
		),
		cell: ({ row }) => (
			<div className="text-right text-muted-foreground">
				${row.original.platform_fee.toFixed(2)}
			</div>
		),
	},
	{
		accessorKey: "net_amount",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Neto" />
		),
		cell: ({ row }) => (
			<div className="text-right font-medium">
				${row.original.net_amount.toFixed(2)}
			</div>
		),
	},
	{
		accessorKey: "status",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Estado" />
		),
		cell: ({ row }) => <PayoutStatusBadge status={row.original.status} />,
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => <PayActionCell payout={row.original} />,
	},
];
