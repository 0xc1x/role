import type { OrderStatus as OrderStatusType } from "@0xc1x/role-commons";

import { isActiveStatus } from "@/features/orders/domain/order";
import type { OrderDetail } from "@/features/orders/domain/order";

/** Tab of the orders list: active vs history (terminal states). */
export type OrdersTab = "active" | "history";

/** Sort orderings used in the orders catalog. */
export type OrdersSort = "newest" | "oldest";

export const ORDERS_SORTS: readonly OrdersSort[] = ["newest", "oldest"];

export interface OrdersFilters {
	tab: OrdersTab;
	branchId: string | null;
	status: OrderStatusType | null;
	searchQuery: string;
	sort: OrdersSort;
}

const DEFAULT_FILTERS: OrdersFilters = {
	tab: "active",
	branchId: null,
	status: null,
	searchQuery: "",
	sort: "newest",
};

/**
 * Pure filter/sort helper for the business orders catalog
 * (ported from Rolé v1 `OrdersContent._filteredOrders`).
 */
export function filterAndSortOrders(
	orders: OrderDetail[],
	filters: Partial<OrdersFilters>,
): OrderDetail[] {
	const f: OrdersFilters = { ...DEFAULT_FILTERS, ...filters };
	const query = f.searchQuery.trim().toLowerCase();

	return orders
		.filter((item) =>
			f.tab === "active"
				? isActiveStatus(item.order.status)
				: !isActiveStatus(item.order.status),
		)
		.filter(
			(item) =>
				f.branchId === null ||
				item.businessLocationId === f.branchId,
		)
		.filter(
			(item) =>
				f.status === null || item.order.status === f.status,
		)
		.filter((item) => {
			if (query.length === 0) return true;
			return (
				item.order.order_number.toLowerCase().includes(query) ||
				item.offerTitle.toLowerCase().includes(query) ||
				(item.customerName?.toLowerCase().includes(query) ?? false)
			);
		})
		.sort((a, b) =>
			f.sort === "newest"
				? b.order.created_at.localeCompare(a.order.created_at)
				: a.order.created_at.localeCompare(b.order.created_at),
		);
}

/** Headline metrics for the orders tab header. */
export interface OrderStats {
	pendingCount: number;
	readyCount: number;
	todayCompletedCount: number;
}

/**
 * Aggregates the headline stats (pending / ready / completed today)
 * from the full order set, ignoring filters.
 */
export function orderStats(orders: OrderDetail[]): OrderStats {
	let pendingCount = 0;
	let readyCount = 0;
	let todayCompletedCount = 0;
	const now = new Date();

	for (const item of orders) {
		const status = item.order.status;
		if (status === "pending") pendingCount += 1;
		if (status === "ready_for_pickup") readyCount += 1;
		if (status === "completed" && isSameLocalDay(item.order.created_at, now)) {
			todayCompletedCount += 1;
		}
	}
	return { pendingCount, readyCount, todayCompletedCount };
}

/** True when the ISO date falls on the same calendar day (local time). */
function isSameLocalDay(iso: string, now: Date): boolean {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return false;
	return (
		date.getFullYear() === now.getFullYear() &&
		date.getMonth() === now.getMonth() &&
		date.getDate() === now.getDate()
	);
}