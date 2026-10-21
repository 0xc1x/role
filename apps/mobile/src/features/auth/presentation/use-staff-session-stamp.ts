import { useEffect } from "react";

import { stampStaffSession } from "@/src/features/auth/data/staff-session";

/**
 * Sella la sesión de staff con el negocio ya resuelto.
 *
 * ─── POR QUÉ HACE FALTA CUANDO EL LOGIN YA SELLÓ ──────────────────────────────
 *
 * Porque el sello del login sella SIN negocio: la BASE lo resuelve cuando la
 * persona tiene exactamente una membresía viva. Con dos o más —el dueño real
 * tiene seis negocios en producción— la respuesta es `multiple_businesses` y no
 * se sella nada. Quien abre el panel de un negocio, en cambio, ya sabe cuál
 * es: por eso el sello se repite con el negocio en el cuerpo, y así la
 * membresía que se sella es la que se está usando (§5.2).
 *
 * ─── POR QUÉ NUNCA ROMPE LA PANTALLA ──────────────────────────────────────────
 *
 * Porque `stampStaffSession` no lanza: el login ya ocurrió y la sesión está
 * abierta, así que un fallo al sellar es un problema del aparato —el API no
 * está, la red se cayó— y no un motivo para echar a quien acaba de entrar.
 * Perder el sello se recupera (la pantalla vuelve a sellar al abrirse); perder
 * el login, no.
 *
 * ─── POR QUÉ ES UN HOOK Y NO LA PANTALLA ──────────────────────────────────────
 *
 * Porque el efecto tiene que poder_SE AFIRMAR: la ruta vive en `app/**` y el
 * arnés del repo no monta pantallas con navegación. El efecto vive acá, que sí
 * se monta, y la pantalla lo llama.
 *
 * ─── POR QUÉ SIN NEGOCIO NO SE SELLA NADA ─────────────────────────────────────
 *
 * Porque `stampStaffSession` sin negocio hace el POST SIN CUERPO, y el cuerpo
 * es lo que decide a qué membresía se sella. Llamarlo sin negocio desde la
 * pantalla del equipo repetiría la respuesta `multiple_businesses` del login:
 * trabajo de red para no sellar nada.
 *
 * @param businessId El negocio de la pantalla; sin él, no se sella.
 */
export function useStaffSessionStamp(businessId?: string): void {
	useEffect(() => {
		if (!businessId) return;
		void stampStaffSession(businessId);
	}, [businessId]);
}
