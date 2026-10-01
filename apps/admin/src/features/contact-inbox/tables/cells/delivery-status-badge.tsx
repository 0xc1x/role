import type { ContactDeliveryStatus } from "@0xc1x/role-commons";
import { Badge } from "@/components/ui/badge";
import { contactDeliveryStatusLabel } from "@/lib/labels";

const DELIVERY_STATUS_VARIANTS: Record<
	ContactDeliveryStatus,
	"info" | "secondary" | "success" | "warning" | "destructive"
> = {
	PENDIENTE: "warning",
	PROCESADO: "success",
	ERROR: "destructive",
};

/**
 * Estado de ENTREGA del aviso de un mensaje de contacto.
 *
 * Lo usan la tabla y el drawer, así que sale del archivo de columnas: ese
 * módulo tiene que exportar solo configuración de tabla para que el refresco en
 * caliente no tire el estado de ambas superficies.
 */
export const DeliveryStatusBadge = ({
	deliveryStatus,
}: {
	deliveryStatus: ContactDeliveryStatus;
}) => (
	<Badge variant={DELIVERY_STATUS_VARIANTS[deliveryStatus] ?? "secondary"}>
		{contactDeliveryStatusLabel(deliveryStatus)}
	</Badge>
);
