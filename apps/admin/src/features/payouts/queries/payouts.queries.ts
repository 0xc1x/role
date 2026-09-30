import type { ListPayoutsQuery } from "@0xc1x/role-commons";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAllPages } from "@/lib/api/fetch-all-pages";
import { notifyMutationError } from "@/lib/api/notify";
import { payoutsApi } from "../api/payouts.api";
import { sumPayoutTotals } from "../lib/payout-totals";
import { payoutsKeys } from "./payouts.keys";

export const payoutsListOptions = (params?: ListPayoutsQuery) =>
	queryOptions({
		queryKey: payoutsKeys.list(params),
		queryFn: () => payoutsApi.list(params),
		staleTime: 30_000,
	});

/**
 * Totales del CONJUNTO FILTRADO, no de la página.
 *
 * POR QUÉ RECORRE PÁGINAS: la tabla muestra 10 filas y el filtro activo puede
 * cubrir 4.000. Sumar la página visible y llamarlo "total" es una mentira de
 * alcance —el mismo defecto que `fetch-all-pages.ts` ya resolvió para el CSV— y en
 * dinero se traduce directamente en una conciliación mal cuadrada. Se recorre con
 * el MISMO helper que la exportación, con los mismos filtros, así que el total y el
 * archivo nunca pueden describir conjuntos distintos.
 *
 * `page` y `limit` del `params` se ignoran: los pone `fetchAllPages`.
 */
export const payoutsTotalsOptions = (params?: ListPayoutsQuery) =>
	queryOptions({
		queryKey: payoutsKeys.totals(params),
		queryFn: async () =>
			sumPayoutTotals(
				await fetchAllPages(payoutsApi.list, params ?? { page: 1, limit: 20 }),
			),
		staleTime: 30_000,
	});

export function usePayoutsList(params?: ListPayoutsQuery) {
	return useQuery(payoutsListOptions(params));
}

export function usePayoutsTotals(params?: ListPayoutsQuery) {
	return useQuery(payoutsTotalsOptions(params));
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
