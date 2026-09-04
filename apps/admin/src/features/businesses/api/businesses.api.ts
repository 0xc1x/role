import type {
	BusinessDto,
	CreateBusinessDto,
	ListBusinessesQuery,
	PaginatedData,
	UpdateBusinessDto,
} from "@0xc1x/role-commons";
import { createResourceApi } from "@/lib/api/resource";

type BusinessPaginatedData = PaginatedData<BusinessDto>;

const base = createResourceApi<
	BusinessDto,
	CreateBusinessDto,
	UpdateBusinessDto,
	ListBusinessesQuery,
	BusinessPaginatedData
>("/businesses");

export const businessesApi = base;
