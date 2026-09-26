import type { ListAdminOrdersQuery } from "@0xc1x/role-commons";
import { useQuery } from "@tanstack/react-query";
import { createListOptions } from "@/lib/query/resource-helpers";
import { ordersApi } from "../api/orders.api";
import { ordersKeys } from "./orders.keys";

export const ordersListOptions = createListOptions(ordersKeys, ordersApi.list);

export function useOrdersList(params?: ListAdminOrdersQuery) {
	return useQuery(ordersListOptions(params));
}
