import type { StaffSessionState } from "@0xc1x/role-commons";

import { api } from "@/src/core/api/client";

/**
 * Sella la sesión de staff: `POST /staff/session` escribe
 * `last_authenticated_at` en la fila de `business_members` y devuelve el
 * estado de sesión §5.2 (`role`, `location_ids`, `expires_at`, `reason`,
 * `business_ids`).
 *
 * ─── POR QUÉ NUNCA LANZA ──────────────────────────────────────────────────────
 *
 * Porque el login ya ocurrió: la sesión de Supabase está abierta y la persona
 * ya está dentro. Un fallo al sellar es un problema del APARATO —el API no
 * está, falta `EXPO_PUBLIC_API_URL`, se cayó la red— y no un motivo para
 * echar a quien acaba de entrar. Perder el sello se recupera (el panel vuelve
 * a sellar al abrir el negocio); perder el login, no.
 *
 * ─── POR QUÉ EL NEGOCIO VA EN EL CUERPO, Y A VECES NO VA ─────────────────────
 *
 * Sin `business_id` la BASE resuelve: la membresía del que pregunta cuando
 * tiene exactamente una activa, y `multiple_businesses` con la lista cuando
 * tiene varias (y entonces no sella NADA —sellar la equivocada renueva la
 * sesión de un negocio en el que la persona no está trabajando). Con
 * `business_id` se sella esa fila y sólo esa: es el caso del panel que ya
 * eligió negocio.
 *
 * El cuerpo va o no va, pero el POST va SIEMPRE: sin cuerpo la ruta resuelve,
 * con cuerpo sella. Por eso no hay una rama que se salte la llamada.
 */
export async function stampStaffSession(
	businessId?: string,
): Promise<StaffSessionState | null> {
	try {
		if (!businessId) {
			return await api.post<StaffSessionState>("/staff/session");
		}
		return await api.post<StaffSessionState>("/staff/session", {
			business_id: businessId,
		});
	} catch (error) {
		// El evento va en el primer argumento para que se pueda grepear.
		console.warn("staff_session_stamp_failed", error);
		return null;
	}
}
