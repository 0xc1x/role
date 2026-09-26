import type { AdminOrderListItemDto } from "@0xc1x/role-commons";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye } from "lucide-react";
import { useState } from "react";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrderDetailDrawer } from "@/features/orders/components/order-detail-drawer";
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
	return (
		<>
			<Button size="sm" variant="outline" onClick={() => setDetail(order)}>
				<Eye /> Ver ficha
			</Button>
			{detail && (
				<OrderDetailDrawer
					order={detail}
					isOpen={true}
					onClose={() => setDetail(null)}
				/>
			)}
		</>
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
