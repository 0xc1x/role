import type { AdminOrderListItemDto, OrderStatus } from "@0xc1x/role-commons";
import {
	ORDER_TRANSITIONS,
	shouldAccrueEarningsOnTransition,
	shouldRestockOnTransition,
} from "@0xc1x/role-commons";
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
import { Spinner } from "@/components/ui/spinner";
import { orderStatusLabel } from "@/lib/labels";

/**
 * Confirmación de un cambio de estado de una orden.
 *
 * NO es un "¿seguro?": el operador no está cambiando una etiqueta, está moviendo
 * inventario y saldo. Cancelar o vencer devuelve la unidad reservada al stock de
 * la oferta —vuelve a estar a la venta—, y completar suma el importe neto de la
 * orden al balance del negocio. Los dos efectos se derivan del grafo compartido
 * (`shouldRestockOnTransition`, `shouldAccrueEarningsOnTransition`) para que este
 * texto no pueda quedar viejo si la API cambia de reglas.
 *
 * El aviso de irreversibilidad también sale del grafo: solo los estados
 * terminales se anuncian como no reversibles, porque un estado intermedio se
 * puede corregir moviéndolo a otro legal más adelante.
 *
 * El aviso de saldo no menciona quién lo ejecuta a propósito: el acumulado lo
 * aplica el trigger `accrue_order_earnings` de Supabase o el espejo de la API
 * según `ENABLE_API_MIRROR_ORDERS`, y para el operador el saldo se mueve igual.
 */
export function OrderStatusDialog({
	order,
	to,
	open,
	onOpenChange,
	onConfirm,
	isPending,
}: {
	order: AdminOrderListItemDto;
	to: OrderStatus;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isPending: boolean;
}) {
	const from = order.status;
	const restocks = shouldRestockOnTransition(from, to);
	const accrues = shouldAccrueEarningsOnTransition(to);
	const isTerminal = (ORDER_TRANSITIONS[to] ?? []).length === 0;
	const destructive = to === "cancelled" || to === "expired";

	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						¿Mover la orden {order.order_number} a {orderStatusLabel(to)}?
					</AlertDialogTitle>
					<AlertDialogDescription>
						Pasa de {orderStatusLabel(from)} a {orderStatusLabel(to)}. La API lo
						aplica en la misma transacción que estos efectos.
					</AlertDialogDescription>
				</AlertDialogHeader>

				{restocks ? (
					<p className="text-sm">
						Se devuelve la unidad reservada al stock de la oferta y vuelve a
						estar disponible para la compra.
					</p>
				) : null}

				{accrues ? (
					<p className="text-sm">
						Se suma el importe neto de la orden (neto de comisión) al saldo del
						negocio.
					</p>
				) : null}

				{!restocks && !accrues ? (
					<p className="text-muted-foreground text-sm">
						Solo cambia el estado de la orden: no devuelve stock ni mueve
						saldos.
					</p>
				) : null}

				<p className="text-muted-foreground text-sm">
					{isTerminal
						? `El estado ${orderStatusLabel(to)} es terminal: la orden no admite más transiciones y no se puede deshacer.`
						: "Se puede corregir más adelante moviéndola a otro estado legal."}
				</p>

				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						variant={destructive ? "destructive" : "default"}
						disabled={isPending}
						onClick={onConfirm}
					>
						{isPending ? (
							<>
								<Spinner />
								Moviendo...
							</>
						) : (
							`Mover a ${orderStatusLabel(to)}`
						)}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
