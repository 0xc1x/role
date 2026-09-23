import { strings } from "@/src/core/i18n/strings";
import { useTheme } from "@/src/core/theme";
export { BusinessStatsRowSkeleton as OrderStatsRowSkeleton } from "../products/BusinessStatsRow";
import type { OrderStats } from "@/src/features/business/domain/orders";
import { StatsMetricsCard } from "../StatsMetricsCard";
import { CircleCheck, Clock, PackageCheck } from "lucide-react-native";

/**
 * Headline order metrics (ported from Rolé v1 `OrderStatsRow`):
 * Pendientes / Listos / Hoy.
 */
export function OrderStatsRow({ stats }: { stats: OrderStats }) {
	const { colors } = useTheme();

	const items = [
		{
			label: strings.business.ordersPendingStat,
			value: stats.pendingCount,
			icon: Clock,
			color: colors.warning,
			bg: colors.surfaceWarning,
		},
		{
			label: strings.business.ordersReadyStat,
			value: stats.readyCount,
			icon: PackageCheck,
			color: colors.info,
			bg: colors.infoSurface,
		},
		{
			label: strings.business.ordersTodayStat,
			value: stats.todayCompletedCount,
			icon: CircleCheck,
			color: colors.success,
			bg: colors.surfaceSuccess,
		},
	];

	return <StatsMetricsCard items={items} />;
}
