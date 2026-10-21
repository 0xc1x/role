import type {
	BusinessMemberDto,
	RevokeBusinessAccessResponseDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";

/**
 * Los accesos del equipo de un negocio, para el panel de administración.
 *
 * El panel SUPERVISA: lee el roster y corta el acceso de todos cuando hace
 * falta. No da de alta ni edita accesos —esas rutas son del dueño y del
 * gerente, y el panel no las tiene—.
 *
 * ─── POR QUÉ NO HAY SCHEMAS DE ZOD ACÁ ───────────────────────────────────────
 *
 * El contrato está en `commons` y lo valida la API: el panel no re-declara la
 * forma de la respuesta, la importa. Un `zod` en el cliente sería una segunda
 * copia del contrato que puede desincronizarse sin que nada se ponga rojo.
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
	revokeAll: (businessId: string) =>
		api.post<RevokeBusinessAccessResponseDto>(
			`/businesses/${businessId}/staff/revoke-all`,
		),
};
