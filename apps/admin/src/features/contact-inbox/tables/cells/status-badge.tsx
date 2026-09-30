import type { ContactMessageStatus } from "@0xc1x/role-commons";
import { Badge } from "@/components/ui/badge";
import { contactMessageStatusLabel } from "@/lib/labels";

const STATUS_VARIANTS: Record<
	ContactMessageStatus,
	"info" | "secondary" | "success" | "warning" | "destructive"
> = {
	PENDIENTE: "warning",
	PROCESADO: "success",
	ERROR: "destructive",
};

/**
 * Estado de un mensaje de contacto.
 *
 * Lo usan la tabla y el drawer, así que sale del archivo de columnas: ese
 * módulo tiene que exportar solo configuración de tabla para que el refresco en
 * caliente no tire el estado de ambas superficies.
 */
export const StatusBadge = ({ status }: { status: ContactMessageStatus }) => (
	<Badge variant={STATUS_VARIANTS[status] ?? "secondary"}>
		{contactMessageStatusLabel(status)}
	</Badge>
);
