import { ORDER_TRANSITIONS, type OrderStatus } from "@0xc1x/role-commons";
import { orderStatusLabel } from "@/lib/labels";

/** Una transición legal, ya traducida y con su tono para el menú de la fila. */
export type OrderStatusAction = {
	status: OrderStatus;
	label: string;
	/** `cancelled` y `expired` matan la orden: se pintan como acción destructiva. */
	destructive: boolean;
};

/**
 * Opciones legales para el estado actual de la orden.
 *
 * La lista sale del grafo compartido (`ORDER_TRANSITIONS`), el mismo que la API
 * aplica: un desplegable con los siete estados dejaría al operador descubrir por
 * un 422 que una transición no era válida. Los estados terminales no tienen
 * aristas salientes, así que acá devuelven una lista vacía y la fila no ofrece
 * ninguna acción.
 */
export function orderStatusActions(status: OrderStatus): OrderStatusAction[] {
	return (ORDER_TRANSITIONS[status] ?? []).map((next) => ({
		status: next,
		label: orderStatusLabel(next),
		destructive: next === "cancelled" || next === "expired",
	}));
}
