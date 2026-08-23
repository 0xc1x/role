import type {
	CreateTipDto,
	ListTipsQuery,
	TipDto,
	TipPaginatedData,
	UpdateTipDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

export const tipsApi = {
	list: (query?: ListTipsQuery) =>
		api.get<TipPaginatedData>(
			`/tips${toSearchParams(query as Record<string, string | number | boolean | undefined>)}`,
		),

	getById: (id: string) => api.get<TipDto>(`/tips/${id}`),

	create: (body: CreateTipDto) => api.post<TipDto>("/tips", body),

	update: (id: string, body: UpdateTipDto) =>
		api.patch<TipDto>(`/tips/${id}`, body),

	remove: (id: string) => api.delete<TipDto>(`/tips/${id}`),
};
