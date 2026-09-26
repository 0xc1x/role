import type {
	AdminOrderPaginatedData,
	ListAdminOrdersQuery,
} from "@0xc1x/role-commons";
import { api } from "@/lib/api/client";
import { toSearchParams } from "@/lib/api/http";

/**
 * Superficie de solo lectura. La transición de estado de una orden mueve stock y
 * dinero y hoy la API la permite a cualquier admin sobre órdenes ajenas
 * (`canActorTransition` cortocircuita por rol); exponer ese botón en el panel sin
 * una decisión de producto sería poner la decisión en un clic.
 */
export const ordersApi = {
	list: (query?: ListAdminOrdersQuery) =>
		api.get<AdminOrderPaginatedData>(`/orders/admin${toSearchParams(query)}`),
};
