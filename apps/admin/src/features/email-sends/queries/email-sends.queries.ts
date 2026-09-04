import type {
	EmailSendDto,
	EmailSendPaginatedData,
	ListSendsQuery,
} from "@0xc1x/role-commons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createUseUpdate } from "@/lib/query/resource-helpers";
import { emailSendsApi } from "../api/email-sends.api";
import { emailSendsKeys } from "./email-sends.keys";

export function useEmailSendsList(params?: ListSendsQuery) {
	return useQuery<EmailSendPaginatedData>({
		queryKey: emailSendsKeys.list(params),
		queryFn: () => emailSendsApi.list(params as never),
		staleTime: 30_000,
	});
}
export const emailSendsListOptions = (params?: ListSendsQuery) => ({
	queryKey: emailSendsKeys.list(params),
	queryFn: () => emailSendsApi.list(params as never),
	staleTime: 30_000,
});

export const useUpdateEmailSend = createUseUpdate<
	Partial<EmailSendDto>,
	EmailSendDto
>(emailSendsKeys, emailSendsApi.update);

export function useRetryEmailSend() {
	return useMutation({
		mutationFn: (id: string) => emailSendsApi.retry(id),
	});
}
