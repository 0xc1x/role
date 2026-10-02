import type { BugTriageState } from "@0xc1x/role-commons";
import { Badge } from "@/components/ui/badge";
import { bugTriageStateLabel } from "@/lib/labels";

const BUG_TRIAGE_STATE_VARIANTS: Record<
	BugTriageState,
	"info" | "secondary" | "success" | "warning" | "destructive"
> = {
	ABIERTO: "info",
	EN_REPRODUCCION: "warning",
	CORREGIDO: "success",
	DUPLICADO: "secondary",
	DESCARTADO: "destructive",
};

/**
 * Estado del TRIAGE de un reporte de error. Lo usan la tabla y el drawer, así
 * que sale del archivo de columnas: ese módulo exporta solo configuración de
 * tabla, y meter un badge con estado visual ahí lo ataría al refresco en
 * caliente de las dos superficies.
 *
 * `state: null` se pinta "Sin triar", NO el token crudo. Y acá está el matiz que
 * el contrato no puede resolver por nosotros: la API estrecha `state` contra el
 * vocabulario y cae a `null` sin lanzar, así que `null` significa LAS DOS cosas
 * — "nadie lo ha tocado" y "tenía un valor que el panel no reconoce". No hay
 * forma de distinguirlas desde acá, y el texto honesto para las dos es el mismo:
 * nadie lo triageó desde el panel. Un badge que dijera "Sin triagear" sobre una
 * fila a la que alguien sí le puso `REABIERTO` a mano affirmaría algo que la
 * base no dice.
 *
 * `readable: false` es otra cosa y NO se pinta acá: es que el `value` de la fila
 * no se pudo parsear, no que falte el triaje. La columna del resumen lo dice.
 */
export const TriageBadge = ({ state }: { state: BugTriageState | null }) => {
	if (!state) {
		return <Badge variant="outline">Sin triar</Badge>;
	}
	return (
		<Badge variant={BUG_TRIAGE_STATE_VARIANTS[state] ?? "secondary"}>
			{bugTriageStateLabel(state)}
		</Badge>
	);
};
