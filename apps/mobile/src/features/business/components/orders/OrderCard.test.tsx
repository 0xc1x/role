import { expect, mock, test } from "bun:test";
import { createElement } from "react";
// @ts-expect-error react-dom is installed without declarations in this workspace.
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Use the installed React Native Web renderer for SSR.
import * as nativeWeb from "react-native-web";
import { light, dark } from "@/src/core/theme/colors";
import { strings } from "@/src/core/i18n/strings";
import { formatDateTime, formatMoney } from "@/src/core/utils/formatters";
import { orderStatusLabels, type OrderDetail, type OrderStatusType } from "@/src/features/orders/domain/order";

let colors = light;
let isPending = false;
mock.module("react-native", () => nativeWeb);
mock.module("@rn-primitives/slot", () => ({ Slot: nativeWeb.Text }));
mock.module("expo-router", () => ({ router: { push: () => {} } }));
mock.module("expo-image", () => ({ Image: nativeWeb.View }));
mock.module("@/src/core/theme", () => ({ useTheme: () => ({ colors }) }));
mock.module("@/src/features/business/hooks", () => ({
	useUpdateOrderStatus: () => ({ isPending, mutate: () => {} }),
}));
const { AppText } = await import("@/src/core/ui/AppText");
mock.module("@/src/core/ui", () => ({
	AppText,
	StatusBadge: ({ label }: { label: string }) => createElement(AppText, null, label),
}));
mock.module("@/components/ui/alert-dialog", () => Object.fromEntries(
	["AlertDialog", "AlertDialogAction", "AlertDialogCancel", "AlertDialogContent",
		"AlertDialogDescription", "AlertDialogFooter", "AlertDialogHeader", "AlertDialogTitle"]
		.map((name) => [name, () => null]),
));
const { OrderCard, OrderCardSkeleton } = await import("./OrderCard");
const { OrderCardSkeleton: ConsumerOrderCardSkeleton } = await import("@/src/features/orders/components/OrderCard");
const { OrderStatsRowSkeleton } = await import("./OrderStatsRow");
const { BusinessStatsRowSkeleton } = await import("../products/BusinessStatsRow");
const item: OrderDetail = {
	order: {
		id: "order-1", user_id: "customer-1", offer_id: "offer-1", business_id: "business-1",
		order_number: "20260916-12345678901234567890", status: "pending", price: 12345,
		original_price: 20000, pickup_code: "1234", pickup_time: null, coupon_id: null,
		commission_rate: 0.1, platform_fee: 1234.5, net_amount: 11110.5, payout_id: null,
		created_at: "2026-09-16T12:30:00", updated_at: "2026-09-16T12:30:00",
	},
	offerTitle: "Artisan bread selection with seasonal pastries", offerImageUrl: null,
	businessName: "Bakery", businessImageUrl: null, businessAddress: null,
	businessPhone: null, businessLocationId: null, customerName: "Alexandra Montgomery Richardson",
	customerPhone: null, customerEmail: null, events: [],
};

const actionCounts: Record<OrderStatusType, number> = {
	pending: 2, confirmed: 1, ready_for_pickup: 1, picked_up: 0,
	completed: 0, cancelled: 0, expired: 0,
};

test("renders all business statuses with metadata and independent footer presses in both themes", () => {
	for (const palette of [light, dark]) {
		colors = palette;
		for (const status of Object.keys(actionCounts) as OrderStatusType[]) {
			const html = renderToStaticMarkup(createElement(OrderCard, {
				businessId: "business-1", item: { ...item, order: { ...item.order, status } },
			}));
			const buttons = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((match) => match[1]!);
			expect(buttons).toHaveLength(1 + actionCounts[status]);
			expect(buttons.every((body) => !body.includes("<button"))).toBe(true);
			for (const value of [item.offerTitle, item.order.order_number, item.customerName!,
				formatDateTime(item.order.created_at), formatMoney(item.order.price), orderStatusLabels[status]]) {
				expect(buttons[0]).toContain(value);
			}
			if (status === "pending" || status === "confirmed") expect(buttons[1]).toContain(strings.business.ordersMarkReady);
			if (status === "ready_for_pickup") expect(buttons[1]).toContain(strings.business.ordersValidateAndDeliver);
		}
		expect(renderToStaticMarkup(createElement(OrderCardSkeleton))).not.toBeEmpty();
	}
});

test("order skeletons expose loading without actions and omit active footers for history", () => {
	for (const palette of [light, dark]) {
		colors = palette;
		for (const [Component, footer] of [
			[OrderCardSkeleton, "order-actions-skeleton"],
			[ConsumerOrderCardSkeleton, "order-timeline-skeleton"],
		] as const) {
			expect(Component({ active: true }).props.accessibilityState).toEqual({ busy: true });
			const active = renderToStaticMarkup(createElement(Component, { active: true }));
			const history = renderToStaticMarkup(createElement(Component, { active: false }));
			expect(active).toContain(footer);
			expect(history).not.toContain(footer);
			for (const html of [active, history]) {
				expect(html).toContain(strings.common.loading);
				expect(html).not.toContain("<button");
			}
		}
	}
	expect(OrderStatsRowSkeleton).toBe(BusinessStatsRowSkeleton);
});

test("disables pending mutations and handles absent customer and an image", () => {
	isPending = true;
	try {
		for (const status of ["pending", "confirmed"] as const) {
			const html = renderToStaticMarkup(createElement(OrderCard, {
				businessId: "business-1",
				item: { ...item, customerName: null, offerImageUrl: "https://example.invalid/fixture.png", order: { ...item.order, status } },
			}));
			expect(html).not.toContain(item.customerName!);
			expect([...html.matchAll(/aria-disabled="true"/g)]).toHaveLength(actionCounts[status]);
		}
	} finally {
		isPending = false;
	}
});
