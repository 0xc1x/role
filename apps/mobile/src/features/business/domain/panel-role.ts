import type { BusinessMemberRole } from "@/src/features/business/domain/business";

/**
 * El rol mínimo que una sección del panel necesita para pintarse.
 *
 * El vocabulario es el de `business_members` —`owner`, `manager`, `staff`— y
 * el orden es el de AUTORIDAD: `owner` puede todo lo que puede `manager`, que
 * puede todo lo que puede `staff`.
 */
export type PanelMinRole = "owner" | "manager" | "staff";

/**
 * El rango de cada rol: MENOR número, MÁS autoridad.
 *
 * El rango es de ESTE archivo y no de `business_members`: la base guarda el
 * rol, no lo ordena —`business_member_role()` devuelve el rol guardado y
 * nada lo ordena—, así que el orden es una convención del panel, escrita
 * aquí para que nadie la infiera de otro lado.
 */
const ROLE_RANK: Record<PanelMinRole, number> = {
	owner: 0,
	manager: 1,
	staff: 2,
};

/**
 * ¿El rol del lector alcanza el mínimo que pide la sección?
 *
 * ─── POR QUÉ SIN ROL NO SE ABRE NADA ─────────────────────────────────────────
 *
 * El rol llega desde `business_members` (Task 4), y un rol que no se resolvió
 * NO es un permiso: es una ausencia. Un `null` acá significaría «no sabemos
 * quién es», y abrir la configuración con esa duda es regalarle al dueño una
 * pantalla de sucursales a un empleado que quizá no la puede ver. La §9.3
 * manda lo contrario: la UI se adelanta al servidor para que el empleado no
 * descubra los límites fallando —y descubrir un límite por un botón que se
 * pulsa es descubrirlo tarde—. Así que el mínimo se cierra: sin rol, nada.
 *
 * ─── POR QUÉ ESTO ES UN FILTRO DE UI Y NO UNA BARRA ─────────────────────────
 *
 * RLS sigue siendo la frontera de datos (§9.3): esto no concede nada, sólo
 * esconde lo que el servidor iba a negar. La excepción que hay que nombrar es
 * el `UPDATE` de `business_locations`, que RLS NO le niega a un `staff`: ahí
 * esconder el botón es la única barrera que hay.
 *
 * ─── POR QUÉ EL MÍNIMO, Y NO EL ROL EXACTO ──────────────────────────────────
 *
 * El mínimo es lo que dice el §9.3, y es lo que hace que un `owner` vea
 * todo lo que ve un `manager` sin que cada filaDeclare su rol: la fila dice
 * a QUIÉN le habla, y el filtro responde SI ese rol le alcanza.
 *
 * ─── POR QUÉ EL RANGO SE CIERRA TAMBIÉN ANTE UN ROL DESCONOCIDO ──────────────
 *
 * Un rol que no está en el rango no tiene rango: la comparación sale `false` y
 * el mínimo se cierra, igual que con `null`. Un vocabulario que creciera en la
 * base sin que esta tabla lo supiera no abriría nada por accidente.
 */
export function meetsMinRole(
	role: BusinessMemberRole | null,
	minRole: PanelMinRole,
): boolean {
	if (!role) return false;
	return ROLE_RANK[role] <= ROLE_RANK[minRole];
}
