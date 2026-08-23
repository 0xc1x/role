import type {
	CreateTipDto,
	ListTipsQuery,
	UpdateTipDto,
} from "@0xc1x/role-commons";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { tipsApi } from "../api/tips.api";
import { tipsKeys } from "./tips.keys";

export const tipsListOptions = (params?: ListTipsQuery) =>
	queryOptions({
		queryKey: tipsKeys.list(params),
		queryFn: () => tipsApi.list(params),
		staleTime: 30_000,
	});

export function useTipsList(params?: ListTipsQuery) {
	return useQuery(tipsListOptions(params));
}

export function useCreateTip() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: tipsKeys.all,
		mutationFn: (body: CreateTipDto) => tipsApi.create(body),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: tipsKeys.lists() });
		},
	});
}

export function useUpdateTip() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: tipsKeys.all,
		mutationFn: ({ id, body }: { id: string; body: UpdateTipDto }) =>
			tipsApi.update(id, body),
		onSuccess: (data) => {
			void qc.invalidateQueries({ queryKey: tipsKeys.lists() });
			qc.setQueryData(tipsKeys.detail(data.id), data);
		},
	});
}

export function useDeleteTip() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: tipsKeys.all,
		mutationFn: (id: string) => tipsApi.remove(id),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: tipsKeys.all });
		},
	});
}
