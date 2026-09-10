import { strings } from "@/core/i18n/strings";
import { useTheme } from "@/core/theme";
import type { ProductStats } from "@/features/business/domain/products";
import { StatsMetricsCard } from "../StatsMetricsCard";

/**
 * Headline metrics strip (ported from Rolé v1 `StatsRow`):
 * Activos / Vendidos hoy / Disponibles.
 */
export function BusinessStatsRow({ stats }: { stats: ProductStats }) {
	const { colors } = useTheme();

	const items = [
		{
			label: strings.business.activeProducts,
			value: stats.activeCount,
			icon: "bag-handle-outline" as const,
			color: colors.destructiveVibrant,
			bg: colors.destructiveSurface,
		},
		{
			label: strings.business.soldToday,
			value: stats.soldToday,
			icon: "trending-up" as const,
			color: colors.success,
			bg: colors.surfaceSuccess,
		},
		{
			label: strings.business.availableStock,
			value: stats.availableCount,
			icon: "cube-outline" as const,
			color: colors.warning,
			bg: colors.surfaceWarning,
		},
	];

	return <StatsMetricsCard items={items} />;
}