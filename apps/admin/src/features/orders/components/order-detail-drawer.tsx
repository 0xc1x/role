import type { AdminOrderListItemDto } from "@0xc1x/role-commons";
import { Button } from "@/components/ui/button";
import {
	Drawer,
	DrawerBody,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { OrderStatusBadge } from "@/features/orders/tables/orders.columns";
import { formatBusinessDate } from "@/lib/dates";

const stampFmt = new Intl.DateTimeFormat("es-EC", {
	dateStyle: "medium",
	timeStyle: "short",
});

function DetailField({
	label,
	value,
	mono,
}: {
	label: string;
	value?: string | null;
	mono?: boolean;
}) {
	return (
		<div className="space-y-1">
			<p className="text-muted-foreground text-xs font-medium">{label}</p>
			{value ? (
				<p className={`text-sm break-words ${mono ? "font-mono" : ""}`}>
					{value}
				</p>
			) : (
				<p className="text-muted-foreground text-sm">— sin informar —</p>
			)}
		</div>
	);
}

/**
 * Ficha de una orden para el caso "un consumidor reporta un problema": qué se
 * pidió, de quién, en qué estado quedó y hasta cuándo se recogía. La fila del
 * listado ya trae el join de negocio y oferta, así que la ficha no hace una
 * segunda request — el mismo patrón que la ficha de negocio.
 *
 * NO muestra el historial de eventos: la API no expone lectura de `order_events`
 * (solo escrituras), y renderizar una lista vacía haría creer al operador que
 * la orden no tuvo cambios.
 */
export function OrderDetailDrawer({
	order,
	isOpen,
	onClose,
}: {
	order: AdminOrderListItemDto;
	isOpen: boolean;
	onClose: () => void;
}) {
	return (
		<Drawer
			open={isOpen}
			onOpenChange={(open) => !open && onClose()}
			swipeDirection="right"
		>
			<DrawerContent>
				<DrawerHeader>
					<DrawerTitle>Orden {order.order_number}</DrawerTitle>
					<DrawerDescription>
						{order.business_name ?? order.business_id} — estado y ventana de
						recolección
					</DrawerDescription>
				</DrawerHeader>

				<DrawerBody>
					<section className="space-y-3" aria-label="Estado de la orden">
						<div className="flex items-center gap-2">
							<OrderStatusBadge status={order.status} />
							{order.is_stuck ? (
								<span className="text-destructive text-sm font-medium">
									Atascada: la ventana de pickup ya cerró y sigue sin terminar
								</span>
							) : (
								<span className="text-muted-foreground text-sm">
									Creada el {formatBusinessDate(order.created_at)}
								</span>
							)}
						</div>
					</section>

					<section className="space-y-3" aria-label="Negocio y oferta">
						<h3 className="font-medium text-sm">Negocio y oferta</h3>
						<DetailField label="Negocio" value={order.business_name} />
						<DetailField label="Oferta" value={order.offer_title} />
					</section>

					<section className="space-y-3" aria-label="Importe">
						<h3 className="font-medium text-sm">Importe</h3>
						<DetailField
							label="Pagado por el consumidor"
							value={`$${order.price.toFixed(2)}`}
						/>
						<DetailField
							label="Precio original"
							value={`$${order.original_price.toFixed(2)}`}
						/>
					</section>

					<section className="space-y-3" aria-label="Ventana de recogida">
						<h3 className="font-medium text-sm">Ventana de recogida</h3>
						<DetailField
							label="Abre"
							value={stampFmt.format(new Date(order.pickup_start))}
						/>
						<DetailField
							label="Cierra"
							value={stampFmt.format(new Date(order.pickup_end))}
						/>
					</section>

					<section className="space-y-3" aria-label="Identificadores">
						<h3 className="font-medium text-sm">Identificadores</h3>
						<DetailField label="ID de la orden" value={order.id} mono />
						<DetailField
							label="ID del negocio"
							value={order.business_id}
							mono
						/>
						<DetailField label="ID de la oferta" value={order.offer_id} mono />
					</section>

					<section className="space-y-3" aria-label="Historial">
						<h3 className="font-medium text-sm">Historial de estados</h3>
						<p className="text-muted-foreground text-sm">
							No disponible: la API no expone el historial de eventos de la
							orden. El estado actual es el único dato de la máquina de estados
							que recibe este panel.
						</p>
					</section>
				</DrawerBody>

				<DrawerFooter>
					<DrawerClose render={<Button variant="outline" className="w-full" />}>
						Cerrar
					</DrawerClose>
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
