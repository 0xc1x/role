import type {
	AppConfigDto,
	AppConfigPaginatedData,
	CreateAppConfigDto,
	ListAppConfigQuery,
	PublicAppConfigDto,
	UpdateAppConfigDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { createResourceApi } from "@/lib/api/resource";

const base = createResourceApi<
	AppConfigDto,
	CreateAppConfigDto,
	UpdateAppConfigDto,
	ListAppConfigQuery,
	AppConfigPaginatedData
>("/app-config");

export const appConfigApi = {
	...base,
	/** Lista pública clave→valor. */
	listPublic: () => api.get<PublicAppConfigDto[]>("/app-config/public"),
};
