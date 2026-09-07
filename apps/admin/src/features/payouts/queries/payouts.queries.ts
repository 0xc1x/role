import type { ListPayoutsQuery } from "@0xc1x/role-commons";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { payoutsApi } from "../api/payouts.api";
import { payoutsKeys } from "./payouts.keys";

export const payoutsListOptions = (params?: ListPayoutsQuery) =>
	queryOptions({
		queryKey: payoutsKeys.list(params),
		queryFn: () => payoutsApi.list(params),
		staleTime: 30_000,
	});

export function usePayoutsList(params?: ListPayoutsQuery) {
	return useQuery(payoutsListOptions(params));
}

export function useGeneratePayouts() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => payoutsApi.generate(),
		onSuccess: () => void qc.invalidateQueries({ queryKey: payoutsKeys.all }),
	});
}

export function useMarkPaid() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => payoutsApi.markPaid(id),
		onSuccess: () => void qc.invalidateQueries({ queryKey: payoutsKeys.all }),
	});
}
