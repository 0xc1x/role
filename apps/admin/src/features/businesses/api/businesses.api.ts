import type {
	BusinessDto,
	BusinessEmailSendDto,
	BusinessLocationDto,
	CreateBusinessDto,
	CreateBusinessLocationDto,
	ListBusinessesQuery,
	ListBusinessLocationsQuery,
	PaginatedData,
	UpdateBusinessDto,
	UpdateBusinessLocationDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { createResourceApi } from "@/lib/api/resource";

type BusinessPaginatedData = PaginatedData<BusinessDto>;

const base = createResourceApi<
	BusinessDto,
	CreateBusinessDto,
	UpdateBusinessDto,
	ListBusinessesQuery,
	BusinessPaginatedData
>("/businesses");

export const businessesApi = {
	...base,
	/** Avisos transaccionales del negocio: única evidencia de si el correo salió. */
	listEmailSends: (id: string) =>
		api.get<BusinessEmailSendDto[]>(`/businesses/${id}/email-sends`),
};

export type BusinessLocationPaginatedData = PaginatedData<BusinessLocationDto>;

/**
 * Los puntos de retiro son un recurso HIJO del negocio: la ruta lleva el
 * `businessId` en el path y no existe un endpoint top-level, así que la factoría
 * se instancia por negocio y cada instancia devuelve el mismo contrato. Se usa
 * `createResourceApi` para no reescribir las cuatro rutas a mano.
 */
function createBusinessLocationsApi(businessId: string) {
	const basePath = `/businesses/${businessId}/locations`;
	const locations = createResourceApi<
		BusinessLocationDto,
		CreateBusinessLocationDto,
		UpdateBusinessLocationDto,
		ListBusinessLocationsQuery,
		BusinessLocationPaginatedData
	>(basePath);

	return {
		...locations,
		/**
		 * El `DELETE` de la API desactiva la fila y contesta 200 SIN cuerpo
		 * (`removeLocation` devuelve `void`). `api.delete` quedaría tipado como
		 * `Promise<BusinessLocationDto>` y prometería un DTO que nunca llega, así
		 * que este `remove` usa `deleteVoid`, el cliente que ya existe para
		 * endpoints `void`.
		 */
		remove: (locationId: string) => api.deleteVoid(`${basePath}/${locationId}`),
	};
}

export const businessLocationsApi = {
	forBusiness: createBusinessLocationsApi,
};
