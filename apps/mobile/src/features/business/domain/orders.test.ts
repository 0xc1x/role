import { describe, expect, it } from "bun:test";

import type { OrderStatus } from "@0xc1x/role-commons";

import {
	filterAndSortOrders,
	orderStats,
} from "@/features/business/domain/orders";
import type { OrderDetail } from "@/features/orders/domain/order";

function makeOrder(
	overrides: {
		id?: string;
		status?: OrderStatus;
		createdAt?: string;
		orderNumber?: string;
		businessLocationId?: string | null;
		offerTitle?: string;
		customerName?: string | null;
	} = {},
): OrderDetail {
	const order = {
		id: overrides.id ?? "o1",
		user_id: "u1",
		offer_id: "of1",
		business_id: "b1",
		order_number: overrides.orderNumber ?? "000001",
		status: overrides.status ?? "pending",
		price: 50,
		original_price: 100,
		pickup_code: "123456",
		pickup_time: null,
		coupon_id: null,
		created_at: overrides.createdAt ?? "2026-08-16T10:00:00.000Z",
		updated_at: overrides.createdAt ?? "2026-08-16T10:00:00.000Z",
	};
	return {
		order,
		offerTitle: overrides.offerTitle ?? "Pack Sorpresa",
		offerImageUrl: null,
		businessName: "Negocio",
		businessAddress: null,
		businessPhone: null,
		businessLocationId: overrides.businessLocationId ?? null,
		customerName: overrides.customerName ?? null,
		customerPhone: null,
		customerEmail: null,
		events: [],
	} satisfies OrderDetail;
}

describe("filterAndSortOrders", () => {
	it("keeps only active orders on the active tab", () => {
		const orders = [
			makeOrder({ id: "pending", status: "pending" }),
			makeOrder({ id: "ready", status: "ready_for_pickup" }),
			makeOrder({ id: "done", status: "completed" }),
			makeOrder({ id: "cancelled", status: "cancelled" }),
		];
		expect(
			filterAndSortOrders(orders, { tab: "active" }).map((o) => o.order.id),
		).toEqual(["pending", "ready"]);
	});

	it("keeps only history orders on the history tab", () => {
		const orders = [
			makeOrder({ id: "pending", status: "pending" }),
			makeOrder({ id: "done", status: "completed" }),
			makeOrder({ id: "cancelled", status: "cancelled" }),
		];
		expect(
			filterAndSortOrders(orders, { tab: "history" }).map((o) => o.order.id),
		).toEqual(["done", "cancelled"]);
	});

	it("filters by branch (business_location_id)", () => {
		const orders = [
			makeOrder({ id: "a", businessLocationId: "loc1" }),
			makeOrder({ id: "b", businessLocationId: "loc2" }),
			makeOrder({ id: "c", businessLocationId: null }),
		];
		expect(
			filterAndSortOrders(orders, { tab: "active", branchId: "loc2" }).map(
				(o) => o.order.id,
			),
		).toEqual(["b"]);
	});

	it("filters by status", () => {
		const orders = [
			makeOrder({ id: "pending", status: "pending" }),
			makeOrder({ id: "confirmed", status: "confirmed" }),
		];
		expect(
			filterAndSortOrders(orders, {
				tab: "active",
				status: "confirmed",
			}).map((o) => o.order.id),
		).toEqual(["confirmed"]);
	});

	it("searches by order number, offer title and customer, case-insensitive", () => {
		const orders = [
			makeOrder({ id: "a", orderNumber: "ABC-123", status: "pending" }),
			makeOrder({
				id: "b",
				offerTitle: "Panadería Aurora",
				status: "pending",
			}),
			makeOrder({
				id: "c",
				customerName: "María López",
				status: "pending",
			}),
			makeOrder({ id: "d", offerTitle: "Otro", status: "pending" }),
		];
		const byNumber = filterAndSortOrders(orders, {
			tab: "active",
			searchQuery: "abc-123",
		});
		const byOffer = filterAndSortOrders(orders, {
			tab: "active",
			searchQuery: "aurora",
		});
		const byCustomer = filterAndSortOrders(orders, {
			tab: "active",
			searchQuery: "maría",
		});
		expect(byNumber.map((o) => o.order.id)).toEqual(["a"]);
		expect(byOffer.map((o) => o.order.id)).toEqual(["b"]);
		expect(byCustomer.map((o) => o.order.id)).toEqual(["c"]);
	});

	it("trims the search query", () => {
		const orders = [
			makeOrder({ id: "a", orderNumber: "0042", status: "pending" }),
			makeOrder({ id: "b", status: "pending" }),
		];
		expect(
			filterAndSortOrders(orders, { tab: "active", searchQuery: "  0042  " }).map(
				(o) => o.order.id,
			),
		).toEqual(["a"]);
	});

	it("sorts newest first by default and oldest when requested", () => {
		const orders = [
			makeOrder({ id: "old", createdAt: "2026-08-01T10:00:00.000Z" }),
			makeOrder({ id: "mid", createdAt: "2026-08-10T10:00:00.000Z" }),
			makeOrder({ id: "new", createdAt: "2026-08-15T10:00:00.000Z" }),
		];
		expect(
			filterAndSortOrders(orders, { tab: "active", sort: "newest" }).map(
				(o) => o.order.id,
			),
		).toEqual(["new", "mid", "old"]);
		expect(
			filterAndSortOrders(orders, { tab: "active", sort: "oldest" }).map(
				(o) => o.order.id,
			),
		).toEqual(["old", "mid", "new"]);
	});

	it("re-sorts after filtering", () => {
		const orders = [
			makeOrder({
				id: "b",
				status: "ready_for_pickup",
				createdAt: "2026-08-10T10:00:00.000Z",
			}),
			makeOrder({
				id: "a",
				status: "pending",
				createdAt: "2026-08-15T10:00:00.000Z",
			}),
			makeOrder({
				id: "done",
				status: "completed",
				createdAt: "2026-08-14T10:00:00.000Z",
			}),
		];
		expect(
			filterAndSortOrders(orders, { tab: "active" }).map((o) => o.order.id),
		).toEqual(["a", "b"]);
	});
});

describe("orderStats", () => {
	it("counts pending, ready and completed today", () => {
		const today = new Date().toISOString();
		const orders = [
			makeOrder({ id: "p1", status: "pending" }),
			makeOrder({ id: "p2", status: "pending" }),
			makeOrder({ id: "r1", status: "ready_for_pickup" }),
			makeOrder({ id: "r2", status: "ready_for_pickup" }),
			makeOrder({ id: "c1", status: "completed", createdAt: today }),
			makeOrder({ id: "c2", status: "completed", createdAt: "2026-01-01T10:00:00.000Z" }),
			makeOrder({ id: "x", status: "cancelled" }),
		];
		expect(orderStats(orders)).toEqual({
			pendingCount: 2,
			readyCount: 2,
			todayCompletedCount: 1,
		});
	});

	it("returns zeros for an empty list", () => {
		expect(orderStats([])).toEqual({
			pendingCount: 0,
			readyCount: 0,
			todayCompletedCount: 0,
		});
	});
});