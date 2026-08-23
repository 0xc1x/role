import type {
	CommissionDto,
	CommissionPaginatedData,
	ListCommissionsQuery,
	UpdateCommissionDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

export const commissionsApi = {
	list: (query?: ListCommissionsQuery) =>
		api.get<CommissionPaginatedData>(
			`/commissions${toSearchParams(query as Record<string, string | number | boolean | undefined>)}`,
		),

	getById: (id: string) => api.get<CommissionDto>(`/commissions/${id}`),

	update: (id: string, body: UpdateCommissionDto) =>
		api.patch<CommissionDto>(`/commissions/${id}`, body),
};
