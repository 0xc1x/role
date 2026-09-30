import { Badge } from "@/components/ui/badge";
import { orderStatusLabel } from "@/lib/labels";

/**
 * Estado de una orden.
 *
 * Lo usan la tabla y la ficha, así que vive en `tables/cells/` y no en el
 * archivo de columnas: ese módulo exporta solo configuración para que el
 * refresco en caliente no tire el estado de la fila.
 */
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
