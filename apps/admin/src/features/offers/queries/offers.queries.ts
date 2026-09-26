import type { ListOffersQuery } from "@0xc1x/role-commons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createListOptions } from "@/lib/query/resource-helpers";
import { offersApi } from "../api/offers.api";
import { offersKeys } from "./offers.keys";

export const offersListOptions = createListOptions(offersKeys, offersApi.list);

export function useOffersList(params?: ListOffersQuery) {
	return useQuery(offersListOptions(params));
}

/**
 * Desactivar saca la oferta del marketplace al instante. Es la única acción
 * destructiva de la superficie, y por eso la confirmación va en la columna (que
 * nombra negocio y oferta), no en un toast genérico.
 */
export function useDeactivateOffer() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: offersKeys.all,
		mutationFn: (id: string) => offersApi.deactivate(id),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: offersKeys.lists() });
			toast.success("Oferta desactivada.");
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});
}

/** Reverso de la desactivación: sin esto, un clic equivocado no se recupera. */
export function useActivateOffer() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: offersKeys.all,
		mutationFn: (id: string) => offersApi.activate(id),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: offersKeys.lists() });
			toast.success("Oferta reactivada.");
		},
		onError: (err: Error) => {
			toast.error(err.message);
		},
	});
}
