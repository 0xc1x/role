import type { PaginatedData, PayoutDto } from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

export const payoutsApi = {
	list: (query?: Record<string, string | number | undefined>) =>
		api.get<PaginatedData<PayoutDto>>(
			`/payouts${toSearchParams(query as never)}`,
		),
	generate: () => api.post<{ count: number }>("/payouts/generate", {}),
	markPaid: (id: string) => api.patch<PayoutDto>(`/payouts/${id}/pay`, {}),
};
