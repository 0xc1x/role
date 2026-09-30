import type {
	ListOffersQuery,
	OfferDto,
	OfferWithBusiness,
	PaginatedData,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

export type OffersPaginatedData = PaginatedData<OfferWithBusiness>;

/**
 * Superficie de moderación, no de autoría: el operador revisa y desactiva, el
 * negocio publica. Por eso no hay create ni form de oferta acá — se usa
 * `available_only=false` para poder ver también las inactivas, que son
 * justamente el backlog de moderación.
 */
export const offersApi = {
	list: (query?: ListOffersQuery) =>
		api.get<OffersPaginatedData>(`/offers${toSearchParams(query)}`),
	/** `DELETE` = desactivar (soft delete: la fila sigue, `is_active=false`). */
	deactivate: (id: string) => api.deleteVoid(`/offers/${id}`),
	/** Reactivar es un `PATCH` de un campo; sin él, desactivar es sin vuelta. */
	activate: (id: string) =>
		api.patch<OfferDto>(`/offers/${id}`, { is_active: true }),
};
