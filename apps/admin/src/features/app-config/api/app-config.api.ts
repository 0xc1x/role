import type {
	AppConfigDto,
	AppConfigPaginatedData,
	CreateAppConfigDto,
	ListAppConfigQuery,
	PublicAppConfigDto,
	UpdateAppConfigDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

export const appConfigApi = {
	/** Lista completa paginada (admin). */
	list: (query?: ListAppConfigQuery) =>
		api.get<AppConfigPaginatedData>(
			`/app-config${toSearchParams(query as Record<string, string | number | boolean | undefined>)}`,
		),
	/** Lista pública clave→valor. */
	listPublic: () => api.get<PublicAppConfigDto[]>("/app-config/public"),
	create: (body: CreateAppConfigDto) =>
		api.post<AppConfigDto>("/app-config", body),
	update: (key: string, body: UpdateAppConfigDto) =>
		api.patch<AppConfigDto>(`/app-config/${key}`, body),
	remove: (key: string) => api.delete<never>(`/app-config/${key}`),
};
