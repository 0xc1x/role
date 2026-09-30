import type { ReviewModerationItemDto } from "@0xc1x/role-commons";
import { Badge } from "@/components/ui/badge";
import { reviewModerationReasonLabel } from "@/lib/labels";

/**
 * "Oculta" y no "Eliminada": la fila sigue existiendo y se puede revertir. La
 * etiqueta de la columna lo deja claro antes de que el operador tenga que
 * asumirlo, porque toda la diferencia entre esta superficie y un borrado está
 * en esa palabra.
 */
export const EstadoBadge = ({ fila }: { fila: ReviewModerationItemDto }) => (
	<Badge variant={fila.is_hidden ? "destructive" : "success"}>
		{fila.is_hidden ? "Oculta" : "Visible"}
	</Badge>
);

/**
 * El motivo declarado, como columna propia y no como una línea más dentro de
 * "Moderación": es la dimensión por la que la bandeja se filtra y por la que se
 * responde una apelación, así que tiene que poder leerse sin abrir nada.
 *
 * Muestra la ETIQUETA y no el token: el operador no puede traducir
 * `identity_discrimination` en la cabeza. El token sigue disponible en el
 * diálogo de "volver a mostrar" y en el filtro, donde es la identidad estable.
 *
 * Una fila sin motivo dice "Sin motivo registrado" y NO "Sin moderar": el motivo
 * sobrevive al desocultamiento, así que "visible" y "sin motivo" no son lo mismo.
 * Reusar el texto de la columna de moderación además de mentir sobre la fila y
 * de duplicar la misma palabra en dos columnas de la misma fila.
 */
export const MotivoBadge = ({ fila }: { fila: ReviewModerationItemDto }) => {
	if (!fila.moderation_reason) {
		return (
			<span className="text-muted-foreground text-sm">
				Sin motivo registrado
			</span>
		);
	}
	return (
		<span className="block text-sm break-words">
			<Badge variant="outline">
				{reviewModerationReasonLabel(fila.moderation_reason)}
			</Badge>
			{/* El detalle se conserva en la columna de moderación; aquí iría a
			    duplicar texto que nadie lee dos veces. */}
		</span>
	);
};
