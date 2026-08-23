import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { payoutsApi } from "../api/payouts.api";
import { payoutsKeys } from "./payouts.keys";

export const payoutsListOptions = (
	params?: Record<string, string | number | undefined>,
) =>
	queryOptions({
		queryKey: payoutsKeys.list(params),
		queryFn: () => payoutsApi.list(params),
		staleTime: 30_000,
	});

export function usePayoutsList(
	params?: Record<string, string | number | undefined>,
) {
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
