import type { ListAdminOrdersQuery, OrderStatus } from "@0xc1x/role-commons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api/notify";
import { orderStatusLabel } from "@/lib/labels";
import { createListOptions } from "@/lib/query/resource-helpers";
import { ordersApi } from "../api/orders.api";
import { ordersKeys } from "./orders.keys";

export const ordersListOptions = createListOptions(ordersKeys, ordersApi.list);

export function useOrdersList(params?: ListAdminOrdersQuery) {
	return useQuery(ordersListOptions(params));
}

/**
 * Mover una orden por el grafo de estados.
 *
 * Invalida el listado entero y no solo la fila: el filtro «solo atascadas» y
 * los totales se calculan en el servidor, así que una orden que se acaba de
 * desbloquear tiene que desaparecer de esa vista aunque la fila ya no exista
 * en los datos locales.
 */
export function useTransitionOrderStatus() {
	const qc = useQueryClient();
	return useMutation({
		mutationKey: [...ordersKeys.all, "transition"],
		mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
			ordersApi.transitionStatus(id, status),
		onSuccess: (_result, variables) => {
			void qc.invalidateQueries({ queryKey: ordersKeys.lists() });
			toast.success(`Orden movida a ${orderStatusLabel(variables.status)}`);
		},
		// Una transición mueve stock y dinero: si falló, el operador tiene que
		// enterarse con su `requestId`, que es lo único que permite cruzarla con
		// el log del servidor.
		onError: (error) => {
			toast.error(
				formatApiError(error, "No se pudo cambiar el estado de la orden"),
			);
		},
	});
}
