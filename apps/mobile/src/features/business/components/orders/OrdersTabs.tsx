import { strings } from "@/src/core/i18n/strings";
import { SegmentedTabs } from "@/src/core/ui/SegmentedTabs";
import type { OrdersTab } from "@/src/features/business/domain/orders";

const TABS: Array<{ key: OrdersTab; label: string }> = [
	{ key: "active", label: strings.business.ordersTabActive },
	{ key: "history", label: strings.business.ordersTabHistory },
];

export function OrdersTabs({
	tab,
	onChange,
}: {
	tab: OrdersTab;
	onChange: (tab: OrdersTab) => void;
}) {
	return <SegmentedTabs value={tab} items={TABS} onValueChange={onChange} />;
}
