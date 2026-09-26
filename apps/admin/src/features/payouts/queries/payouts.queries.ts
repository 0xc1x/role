import type { ListPayoutsQuery } from "@0xc1x/role-commons";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { notifyMutationError } from "@/lib/api/notify";
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
		onSuccess: (result) => {
			void qc.invalidateQueries({ queryKey: payoutsKeys.all });
			// El `{count}` de la API es el resultado de la operación: sin él el
			// operador no sabe si generó 0 cortes (ya existían) o 12.
			toast.success(
				result.count > 0
					? `Corte generado: ${result.count} corte(s) en estado pendiente`
					: "No se generaron cortes nuevos: ya existen cortes para el período actual",
			);
		},
		onError: notifyMutationError,
	});
}

export function useMarkPaid() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => payoutsApi.markPaid(id),
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: payoutsKeys.all });
			toast.success("Corte marcado como pagado");
		},
		onError: notifyMutationError,
	});
}
