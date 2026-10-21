import {
	type BusinessMemberDto,
	RevokeBusinessAccessResponseSchema,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";

/**
 * Los accesos del equipo de un negocio, para el panel de administración.
 *
 * El panel SUPERVISA: lee el roster y corta el acceso de todos cuando hace
 * falta. No da de alta ni edita accesos —esas rutas son del dueño y del
 * gerente, y el panel no las tiene—.
 *
 * ─── POR QUÉ EL CONTRATO NO SE RE-DECLARA ACÁ ────────────────────────────────
 *
 * El contrato está en `commons` y lo valida la API: el panel no escribe una
 * segunda forma de la respuesta. Pero el corte SÍ parsea el sobre con el
 * schema de `commons` antes de contar sus campos: el móvil ya lo hace, y una
 * deriva del servidor tiene que romper en voz alta en los dos clientes, no
 * sólo en uno.
 *
 * ─── Y POR QUÉ EL CORTE NO LLEVA CUERPO ──────────────────────────────────────
 *
 * El alcance del corte lo decide QUIEN llama, no lo que dice el body: un
 * `member_ids` en el cuerpo sería una segunda puerta de alcance. La API lo
 * acepta vacío y `.strict()` —cualquier clave de más es un 400—.
 */
export const businessStaffApi = {
	/** `GET /businesses/:businessId/staff`: el roster del negocio. */
	list: (businessId: string) =>
		api.get<BusinessMemberDto[]>(`/businesses/${businessId}/staff`),
	/**
	 * `POST /businesses/:businessId/staff/revoke-all`: el corte de emergencia.
	 *
	 * La respuesta dice lo que SE CORTÓ (`disabled`) y si el dueño quedó
	 * afuera (`owner_skipped`): el panel tiene que poder contarlo, en vez de
	 * dejar que el dueño se entere porque su tablet se apagó.
	 */
	revokeAll: async (businessId: string) =>
		RevokeBusinessAccessResponseSchema.parse(
			await api.post<unknown>(`/businesses/${businessId}/staff/revoke-all`),
		),
};
