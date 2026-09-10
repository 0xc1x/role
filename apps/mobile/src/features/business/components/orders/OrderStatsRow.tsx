import { strings } from "@/core/i18n/strings";
import { useTheme } from "@/core/theme";
import type { OrderStats } from "@/features/business/domain/orders";
import { StatsMetricsCard } from "../StatsMetricsCard";

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
			icon: "time-outline" as const,
			color: colors.warning,
			bg: colors.surfaceWarning,
		},
		{
			label: strings.business.ordersReadyStat,
			value: stats.readyCount,
			icon: "bag-check-outline" as const,
			color: colors.info,
			bg: colors.infoSurface,
		},
		{
			label: strings.business.ordersTodayStat,
			value: stats.todayCompletedCount,
			icon: "checkmark-circle-outline" as const,
			color: colors.success,
			bg: colors.surfaceSuccess,
		},
	];

	return <StatsMetricsCard items={items} />;
}