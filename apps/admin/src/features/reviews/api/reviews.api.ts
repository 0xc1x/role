import type {
	HideReviewDto,
	ListReviewsForModerationQuery,
	ReviewModerationItemDto,
	ReviewModerationPaginatedData,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

/**
 * A mano y no con `createResourceApi`: moderar no crea y no borra. Exponer un
 * `delete` aquí —aunque el panel no lo llame— dejaría el agujero abierto en el
 * helper compartido, y borrar es justo lo que esta superficie no puede hacer.
 */
const base = "/reviews/moderation";

export const reviewsApi = {
	list: (query?: ListReviewsForModerationQuery) =>
		api.get<ReviewModerationPaginatedData>(
			`${base}${toSearchParams(query as Record<string, unknown> | undefined)}`,
		),
	/** El motivo es obligatorio y viaja en el cuerpo: es el registro de apelación. */
	hide: (id: string, body: HideReviewDto) =>
		api.patch<ReviewModerationItemDto>(`${base}/${id}/hide`, body),
	/**
	 * Sin cuerpo a propósito: desocultar no es un estado que elija el cliente,
	 * es una transición. El motivo registrado se conserva y lo devuelve la
	 * respuesta, así que el panel puede seguir mostrándolo.
	 */
	unhide: (id: string) =>
		api.patch<ReviewModerationItemDto>(`${base}/${id}/unhide`),
};
