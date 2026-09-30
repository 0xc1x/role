import { Badge } from "@/components/ui/badge";
import { emailSendStatusLabel } from "@/lib/labels";

const STATUS_VARIANTS: Record<
	string,
	"info" | "secondary" | "success" | "warning" | "destructive"
> = {
	pending: "warning",
	queued: "info",
	processing: "info",
	sent: "success",
	delivered: "success",
	failed: "destructive",
	cancelled: "secondary",
	bounced: "warning",
};

/**
 * Estado de un envío.
 *
 * Reutilizable fuera de la tabla (p. ej. el drawer de negocio), así que vive en
 * `tables/cells/` y no en el archivo de columnas: ese módulo exporta solo
 * configuración para que el refresco en caliente no tire el estado de la tabla.
 */
export const StatusBadge = ({ status }: { status: string }) => {
	return (
		<Badge variant={STATUS_VARIANTS[status] ?? "secondary"}>
			{emailSendStatusLabel(status)}
		</Badge>
	);
};
