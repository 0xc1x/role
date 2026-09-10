import type {
	EmailSendDto,
	ListSendsQuery,
	UpdateEmailSendDto,
} from "@0xc1x/role-commons";
import {
	keepPreviousData,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createUseUpdate } from "@/lib/query/resource-helpers";
import { emailSendsApi } from "../api/email-sends.api";
import { emailSendsKeys } from "./email-sends.keys";

export function useEmailSendsList(params?: ListSendsQuery) {
	return useQuery(emailSendsListOptions(params));
}

export const emailSendsListOptions = (params?: ListSendsQuery) =>
	queryOptions({
		queryKey: emailSendsKeys.list(params),
		queryFn: () => emailSendsApi.list(params),
		staleTime: 30_000,
		placeholderData: keepPreviousData,
	});

export const useUpdateEmailSend = createUseUpdate<
	UpdateEmailSendDto,
	EmailSendDto
>(emailSendsKeys, emailSendsApi.update);

export function useRetryEmailSend() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => emailSendsApi.retry(id),
		onSuccess: (send) => {
			void queryClient.invalidateQueries({
				queryKey: emailSendsKeys.lists(),
			});
			queryClient.setQueryData(emailSendsKeys.detail(send.id), send);
		},
	});
}
