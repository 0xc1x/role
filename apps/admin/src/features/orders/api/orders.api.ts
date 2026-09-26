import type {
	AdminOrderPaginatedData,
	ListAdminOrdersQuery,
	OrderStatus,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

/**
 * Superficie de back office para órdenes.
 *
 * `transitionStatus` llama al mismo `PATCH /orders/:id/status` que usan el
 * negocio y el móvil: no hay atajo ni endpoint privilegiado para admin. El panel
 * no puede ofrecer una transición que la API vaya a rechazar con un 422, así
 * que las opciones salen del grafo compartido, no de aquí.
 *
 * El cuerpo de la respuesta es el `OrderResponse` de la API y no se lee: tras
 * mover la orden se vuelve a pedir el listado, para que la insignia de
 * atascada y los totales no sigan mostrando el estado anterior. Por eso el
 * tipo de retorno es `never` y no un DTO que nadie consume.
 */
export const ordersApi = {
	list: (query?: ListAdminOrdersQuery) =>
		api.get<AdminOrderPaginatedData>(`/orders/admin${toSearchParams(query)}`),
	transitionStatus: (id: string, status: OrderStatus) =>
		api.patch<never>(`/orders/${id}/status`, { status }),
};
