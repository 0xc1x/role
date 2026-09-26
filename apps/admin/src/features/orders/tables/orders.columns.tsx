import type { AdminOrderListItemDto, OrderStatus } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OrderDetailDrawer } from "@/features/orders/components/order-detail-drawer";
import { OrderStatusDialog } from "@/features/orders/components/order-status-dialog";
import { orderStatusActions } from "@/features/orders/lib/order-status-actions";
import { useTransitionOrderStatus } from "@/features/orders/queries/orders.queries";
import type { CsvColumn } from "@/lib/csv";
import { orderStatusLabel } from "@/lib/labels";

export function OrderStatusBadge({ status }: { status: string }) {
	// El enum crudo (`ready_for_pickup`) obliga a traducir en la cabeza, y en
	// una pantalla de soporte un estado mal leído es un estado mal atendido.
	const variant =
		status === "completed"
			? "success"
			: status === "cancelled" || status === "expired"
				? "destructive"
				: status === "pending"
					? "warning"
					: "default";
	return <Badge variant={variant}>{orderStatusLabel(status)}</Badge>;
}

const stampFmt = new Intl.DateTimeFormat("es-EC", {
	dateStyle: "short",
	timeStyle: "short",
});

function OrderActionsCell({ order }: { order: AdminOrderListItemDto }) {
	const [detail, setDetail] = useState<AdminOrderListItemDto | null>(null);
	const [transition, setTransition] = useState<OrderStatus | null>(null);
	const transitionMutation = useTransitionOrderStatus();
	// Solo las aristas salientes del estado actual. En un estado terminal la
	// lista viene vacía y la fila no ofrece el desplegable: no hay nada legal
	// que ofrecer y un botón que solo puede fallar es ruido en una pantalla de
	// soporte.
	const actions = orderStatusActions(order.status);

	const handleConfirm = () => {
		if (!transition) return;
		transitionMutation.mutate(
			{ id: order.id, status: transition },
			{ onSuccess: () => setTransition(null) },
		);
	};

	return (
		<div className="flex items-center gap-2">
			<Button size="sm" variant="outline" onClick={() => setDetail(order)}>
				<Eye /> Ver ficha
			</Button>

			{actions.length > 0 ? (
				<DropdownMenu>
					<DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
						<MoreHorizontal className="h-4 w-4" /> Cambiar estado
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuGroup>
							<DropdownMenuLabel>
								Mover desde {orderStatusLabel(order.status)}
							</DropdownMenuLabel>
							{actions.map((action) => (
								<DropdownMenuItem
									key={action.status}
									variant={action.destructive ? "destructive" : "default"}
									disabled={transitionMutation.isPending}
									onClick={() => setTransition(action.status)}
								>
									{action.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			) : null}

			{detail && (
				<OrderDetailDrawer
					order={detail}
					isOpen={true}
					onClose={() => setDetail(null)}
				/>
			)}

			{transition && (
				<OrderStatusDialog
					order={order}
					to={transition}
					open={true}
					onOpenChange={(open) => !open && setTransition(null)}
					onConfirm={handleConfirm}
					isPending={transitionMutation.isPending}
				/>
			)}
		</div>
	);
}

export const ordersColumns: ColumnDef<AdminOrderListItemDto>[] = [
	{
		accessorKey: "order_number",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Orden" />
		),
		cell: ({ row }) => (
			<div className="font-medium">{row.getValue("order_number")}</div>
		),
	},
	{
		accessorFn: (order) => order.business_name ?? order.business_id,
		id: "business",
		header: "Negocio",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{row.original.business_name ?? row.original.business_id.slice(0, 8)}
			</span>
		),
	},
	{
		accessorKey: "offer_title",
		header: "Oferta",
		cell: ({ row }) => (
			<span className="text-sm max-w-56 truncate block">
				{row.getValue("offer_title")}
			</span>
		),
	},
	{
		accessorKey: "status",
		header: "Estado",
		cell: ({ row }) => <OrderStatusBadge status={row.getValue("status")} />,
	},
	{
		// La insignia viene del servidor (`is_stuck`) para que no pueda
		// discrepar del filtro «solo atascadas».
		accessorKey: "is_stuck",
		header: "Atascada",
		cell: ({ row }) =>
			row.getValue("is_stuck") ? (
				<Badge variant="destructive">Atascada</Badge>
			) : (
				<span className="text-muted-foreground text-sm">—</span>
			),
	},
	{
		accessorKey: "price",
		header: "Importe",
		cell: ({ row }) => (
			<div className="text-right font-medium">
				${(row.getValue("price") as number).toFixed(2)}
			</div>
		),
	},
	{
		accessorFn: (order) => order.pickup_end,
		id: "pickup_window",
		header: "Ventana de pickup",
		cell: ({ row }) => (
			<span
				className={
					row.original.is_stuck
						? "text-sm text-destructive"
						: "text-sm text-muted-foreground"
				}
			>
				{stampFmt.format(new Date(row.original.pickup_start))} →{" "}
				{stampFmt.format(new Date(row.original.pickup_end))}
			</span>
		),
	},
	{
		accessorKey: "created_at",
		header: "Creada",
		cell: ({ row }) => (
			<span className="text-sm text-muted-foreground">
				{stampFmt.format(new Date(row.getValue("created_at") as string))}
			</span>
		),
	},
	{
		id: "actions",
		header: "Acciones",
		enableHiding: false,
		cell: ({ row }) => <OrderActionsCell order={row.original} />,
	},
];

/**
 * Exportación del listado de órdenes, en el mismo orden que las columnas de
 * arriba. Sin `user_id` ni `pickup_code`: el listado no los expone y un archivo
 * que se descarga al escritorio no es el lugar para ponerlos.
 *
 * El importe va como número para que la hoja sume, y la ventana de pickup se
 * parte en dos columnas ISO: pegadas en una sola, la hoja las trata como texto.
 */
export const ordersCsvColumns: CsvColumn<AdminOrderListItemDto>[] = [
	{ label: "Orden", value: (o) => o.order_number },
	{ label: "Negocio", value: (o) => o.business_name ?? o.business_id },
	{ label: "Oferta", value: (o) => o.offer_title },
	{ label: "Estado", value: (o) => orderStatusLabel(o.status) },
	{ label: "Atascada", value: (o) => (o.is_stuck ? "Sí" : "No") },
	{ label: "Importe", value: (o) => o.price },
	{ label: "Pickup desde", value: (o) => o.pickup_start },
	{ label: "Pickup hasta", value: (o) => o.pickup_end },
	{ label: "Creada", value: (o) => o.created_at },
];
