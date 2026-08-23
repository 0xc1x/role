import type {
	ListCommissionsQuery,
	UpdateCommissionDto,
} from "@0xc1x/role-commons";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { commissionsApi } from "../api/commissions.api";
import { commissionsKeys } from "./commissions.keys";

export const commissionsListOptions = (params?: ListCommissionsQuery) =>
	queryOptions({
		queryKey: commissionsKeys.list(params),
		queryFn: () => commissionsApi.list(params),
		staleTime: 30_000,
	});

export function useCommissionsList(params?: ListCommissionsQuery) {
	return useQuery(commissionsListOptions(params));
}

export function useUpdateCommission() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: commissionsKeys.all,
		mutationFn: ({ id, body }: { id: string; body: UpdateCommissionDto }) =>
			commissionsApi.update(id, body),
		onSuccess: (data) => {
			void qc.invalidateQueries({ queryKey: commissionsKeys.lists() });
			qc.setQueryData(commissionsKeys.detail(data.id), data);
		},
	});
}
