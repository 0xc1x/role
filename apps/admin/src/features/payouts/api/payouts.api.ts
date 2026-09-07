import type {
	ListPayoutsQuery,
	PaginatedData,
	PayoutDto,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

export const payoutsApi = {
	list: (query?: ListPayoutsQuery) =>
		api.get<PaginatedData<PayoutDto>>(`/payouts${toSearchParams(query)}`),
	generate: () => api.post<{ count: number }>("/payouts/generate", {}),
	markPaid: (id: string) => api.patch<PayoutDto>(`/payouts/${id}/pay`, {}),
};
