import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { useTheme } from "@/src/core/theme";
import { strings } from "@/src/core/i18n/strings";
import { spacing, radii } from "@/src/core/theme/spacing";
import { ErrorState, Screen, ScreenHeader } from "@/src/core/ui";
import { ProductDetail } from "@/src/features/business/components/products/ProductDetail";
import { useOffer } from "@/src/features/hooks";

export default function OfferDetailScreen() {
	const { id, offerId } = useLocalSearchParams<{ id: string; offerId: string }>();
	const businessId = id ?? "";

	const { data: product, isLoading, isError, error, refetch, isFetching } = useOffer(offerId ?? "");

	if (isLoading) return <OfferDetailSkeleton />;
	if (isError || !product)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	return (
		<ProductDetail
			businessId={businessId}
			product={product}
			isRefreshing={isFetching}
			onRefresh={() => void refetch()}
		/>
	);
}

function OfferDetailSkeleton() {
	const { colors } = useTheme();
	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={strings.business.productDetailTitle} />
				{/* Match the loaded title and status before the hero. */}
				<View style={styles.headerRow}>
					<Skeleton style={styles.title} />
					<Skeleton style={styles.statusBadge} />
				</View>
				<Skeleton style={styles.hero} />
				{/* Three stat cards mirror the loaded units/revenue/created columns. */}
				<View style={styles.statsRow}>
					{[0, 1, 2].map((stat) => (
						<View
							key={stat}
							style={[
								styles.statCard,
								{ backgroundColor: colors.card, borderColor: colors.borderSolid },
							]}
						>
							<Skeleton style={styles.statIcon} />
							<Skeleton style={styles.statValue} />
							<Skeleton style={styles.statLabel} />
						</View>
					))}
				</View>
				{/* Same quick actions footprint, placeholders only. */}
				<View style={styles.quickActions}>
					<Skeleton style={[styles.quickAction, styles.quickActionWide]} />
					<Skeleton style={[styles.quickAction, styles.quickActionWide]} />
					<Skeleton style={styles.quickActionIcon} />
				</View>
				{/* Info card: price bars plus the 2-column field grid. */}
				<Card style={styles.infoCard}>
					<View style={styles.infoBody}>
						<View style={styles.priceRow}>
							<Skeleton style={styles.priceMain} />
							<Skeleton style={styles.priceOriginal} />
						</View>
						<View style={styles.grid}>
							{[0, 1, 2, 3, 4, 5, 6, 7].map((field) => (
								<View key={field} style={styles.gridItem}>
									<Skeleton style={styles.gridLabel} />
									<Skeleton style={styles.gridValue} />
								</View>
							))}
						</View>
					</View>
				</Card>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, gap: spacing.lg },
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	title: { flex: 1, height: 28, borderRadius: radii.md },
	statusBadge: { height: 24, width: 84, borderRadius: radii.pill },
	hero: { height: 220, borderRadius: radii.lg },
	statsRow: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	statCard: {
		flex: 1,
		alignItems: "center",
		paddingVertical: spacing.lg,
		paddingHorizontal: spacing.sm,
		borderRadius: radii.lg,
		borderWidth: 1,
		gap: 2,
	},
	statIcon: { width: 30, height: 30, marginBottom: spacing.xs },
	statValue: { height: 23, width: "60%" },
	statLabel: { height: 16, width: "70%" },
	quickActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	quickAction: { height: 48, borderRadius: radii.pill },
	quickActionWide: { flex: 1 },
	quickActionIcon: { width: 48, height: 48, borderRadius: radii.pill },
	infoCard: { borderRadius: radii.lg },
	infoBody: { padding: spacing.lg, gap: spacing.md },
	priceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
	priceMain: { height: 31, width: 90 },
	priceOriginal: { height: 16, width: 56 },
	grid: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.lg },
	gridItem: { width: "50%", paddingRight: spacing.md, gap: 2 },
	gridLabel: { height: 14, width: "60%" },
	gridValue: { height: 20, width: "80%" },
});