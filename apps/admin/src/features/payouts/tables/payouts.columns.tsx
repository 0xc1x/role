import type { PayoutDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useMarkPaid } from "@/features/payouts/queries/payouts.queries";
import { payoutStatusLabel } from "@/lib/labels";

function PayoutStatusBadge({ status }: { status: PayoutDto["status"] }) {
	const variant =
		status === "paid"
			? "default"
			: status === "failed"
				? "destructive"
				: status === "pending"
					? "secondary"
					: "outline";
	return <Badge variant={variant}>{payoutStatusLabel(status)}</Badge>;
}

/**
 * Marcar un corte como pagado no tiene vuelta atrás: la API lo registra como
 * liquidado y el operador ya pagó por fuera. Sin confirmación, un misclick
 * escribe un pago fantasma que nadie recuerda haber hecho.
 */
function PayActionCell({ payout }: { payout: PayoutDto }) {
	const pay = useMarkPaid();
	const [confirming, setConfirming] = useState(false);
	if (payout.status !== "pending") return null;

	return (
		<>
			<Button
				size="sm"
				variant="outline"
				onClick={() => setConfirming(true)}
				disabled={pay.isPending}
			>
				{pay.isPending ? <Spinner /> : null} Marcar pagado
			</Button>

			<AlertDialog
				open={confirming}
				onOpenChange={(open) => !open && setConfirming(false)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>¿Marcar el corte como pagado?</AlertDialogTitle>
						<AlertDialogDescription>
							<span className="font-medium text-foreground">
								{payout.business_name ?? payout.business_id.slice(0, 8)}
							</span>{" "}
							quedará liquidado por{" "}
							<span className="font-medium text-foreground">
								${payout.net_amount.toFixed(2)}
							</span>{" "}
							del período {payout.period_start} → {payout.period_end}. Esta
							acción no se puede deshacer.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={pay.isPending}>
							Cancelar
						</AlertDialogCancel>
						<AlertDialogAction
							disabled={pay.isPending}
							onClick={() => {
								pay.mutate(payout.id, {
									onSettled: () => setConfirming(false),
								});
							}}
						>
							{pay.isPending ? <Spinner /> : null} Marcar pagado
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
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
