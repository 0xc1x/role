import type {
	HideReviewDto,
	ListReviewsForModerationQuery,
} from "@0xc1x/role-commons";
import {
	keepPreviousData,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { notifyMutationError } from "@/lib/api/notify";
import { reviewsApi } from "../api/reviews.api";
import { reviewsKeys } from "./reviews.keys";

export function useReviewsModerationList(
	params?: ListReviewsForModerationQuery,
) {
	return useQuery(reviewsModerationListOptions(params));
}

export const reviewsModerationListOptions = (
	params?: ListReviewsForModerationQuery,
) =>
	queryOptions({
		queryKey: reviewsKeys.list(params),
		queryFn: () => reviewsApi.list(params),
		staleTime: 30_000,
		placeholderData: keepPreviousData,
	});

/**
 * Las dos mutaciones repiten seis líneas a propósito y no se abstraen: la de
 * ocultar manda cuerpo y la de mostrar no, y el helper que las unificaría
 * terminaría con un `body` opcional que solo uno de los dos callers usaría.
 */

/**
 * Oculta una reseña. El cuerpo es el del contrato entero —el token del motivo y
 * el detalle— y no un `string`: la mutación no reescribe lo que el operador
 * eligió en el diálogo. Un panel que reescribe el contrato en el camino es el que
 * termina mandando un motivo que el servidor nunca pidió.
 */
export function useHideReview() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, ...body }: { id: string } & HideReviewDto) =>
			reviewsApi.hide(id, body),
		onSuccess: () => {
			// La fila cambia de estado Y sale del conteo del negocio. Se invalida
			// la lista en vez de parchear la fila en caché: con el filtro por
			// visibilidad la fila puede desaparecer de esta página, y un parche
			// la dejaría visible hasta el próximo refetch.
			void queryClient.invalidateQueries({ queryKey: reviewsKeys.lists() });
		},
		// Sin esto, un fallo al moderar era indistinguible de un click que no se
		// dispara. `notifyMutationError` es el que le pega el `requestId` de la
		// API al mensaje: sin él, soporte no tiene con qué correlacionar.
		onError: notifyMutationError,
	});
}

/** Devuelve la visibilidad a la reseña sin borrar el motivo registrado. */
export function useUnhideReview() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => reviewsApi.unhide(id),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: reviewsKeys.lists() });
		},
		onError: notifyMutationError,
	});
}
