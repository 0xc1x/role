import type {
	EmailSendDto,
	EmailSendPaginatedData,
	ListSendsQuery,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { createResourceApi } from "@/lib/api/resource";

const base = createResourceApi<EmailSendDto, never, Partial<EmailSendDto>, ListSendsQuery, EmailSendPaginatedData>(
	"/email-marketing/sends",
);

export const emailSendsApi = {
	...base,
	retry: (id: string) => api.post<EmailSendDto>(`/email-marketing/sends/${id}/retry`, {}),
};
