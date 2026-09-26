import type {
	BusinessDto,
	BusinessEmailSendDto,
	CreateBusinessDto,
	ListBusinessesQuery,
	PaginatedData,
	UpdateBusinessDto,
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
