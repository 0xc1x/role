import type {
	BugReportDetailDto,
	BugReportPaginatedData,
	BugTriageState,
	ListBugReportsQuery,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

/**
 * A mano y no con `createResourceApi`: el buzón no tiene create ni delete. Un
 * reporte lo escribe la app móvil directamente contra Supabase y el panel no lo
 * borra — lo descarta con `state`, que es un dato, no una eliminación.
 */
const base = "/bug-report-inbox";

export const bugReportApi = {
	list: (query?: ListBugReportsQuery) =>
		api.get<BugReportPaginatedData>(
			`${base}${toSearchParams(query as Record<string, unknown> | undefined)}`,
		),
	detail: (id: string) => api.get<BugReportDetailDto>(`${base}/${id}`),
	/**
	 * El cuerpo es el del contrato entero, `{ state }`, y no un `string` suelto:
	 * la mutación no reescribe lo que el operador eligió.
	 *
	 * LO QUE NO SE MANDA, y es la parte importante: `delivery_status`. El
	 * contrato del PATCH lo descarta (`SetBugReportStateSchema` no lo declara), y
	 * está bien que así sea — en un reporte de errores nadie mueve la entrega
	 * (D8: no hay camino de correo), así que mandarla afirmaría una notificación
	 * que no existe. La UI tampoco la pinta, por el mismo motivo.
	 */
	setState: (id: string, state: BugTriageState) =>
		api.patch<BugReportDetailDto>(`${base}/${id}/state`, { state }),
};
