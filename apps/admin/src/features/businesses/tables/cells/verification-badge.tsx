import { Badge } from "@/components/ui/badge";
import { businessVerificationLabel } from "@/lib/labels";

/**
 * Estado de verificación de un negocio.
 *
 * Vive en `tables/cells/` y no en `businesses.columns.tsx` porque lo usan dos
 * superficies —la tabla y la ficha— y el archivo de columnas debe exportar solo
 * configuración: mezclar badge y columnas rompe el refresco en caliente de ese
 * módulo.
 */
export const VerificationBadge = ({ status }: { status: string }) => {
	const variant =
		status === "approved"
			? "success"
			: status === "pending"
				? "warning"
				: "destructive";
	// El enum crudo (`approved`) obliga a traducir en la cabeza: en un panel de
	// verificación un estado mal leído es una aprobación indebida.
	return <Badge variant={variant}>{businessVerificationLabel(status)}</Badge>;
};
