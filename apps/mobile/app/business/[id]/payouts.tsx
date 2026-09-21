import { ChevronRight, Info, Receipt } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useMemo, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	View,
} from "react-native";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
	StatusBadge,
	useWebPullToRefresh,
} from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useBusinessPayouts, useBusinessPayoutTotals } from "@/src/features/business/hooks";
import { PAYOUT_STATUS_LABELS } from "@/src/features/business/domain/business";
import { formatMoney } from "@/src/core/utils/formatters";
import type { Payout, PayoutStatus } from "@0xc1x/role-commons";
import type { BadgeTone } from "@/src/core/ui";
import { CardPressable } from "@/components/ui/card-presable";

const TONE: Record<PayoutStatus, BadgeTone> = {
	paid: "success",
	pending: "warning",
	processing: "info",
	failed: "danger",
};

type PayoutFilter = "all" | "paid" | "processing";

const FILTERS: ReadonlyArray<{ key: PayoutFilter; label: string }> = [
	{ key: "all", label: strings.business.payoutsFilterAll },
	{ key: "paid", label: strings.business.payoutsFilterPaid },
	{ key: "processing", label: strings.business.payoutsFilterProcessing },
];

export default function BusinessPayoutsScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const [filter, setFilter] = useState<PayoutFilter>("all");
	const {
		data: infiniteData,
		isLoading,
		isError,
		error,
		refetch,
		isFetching,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useBusinessPayouts(businessId, {
		status: filter === "all" ? undefined : filter,
	});
	// Balance cards come from an unfiltered aggregate (exact under any
	// filter); the list below stays status-filtered and paginated.
	const { data: totals, refetch: refetchTotals } =
		useBusinessPayoutTotals(businessId);
	const pull = useWebPullToRefresh({
		onRefresh: () => {
			void refetch();
			void refetchTotals();
		},
		refreshing: isFetching,
	});

	const payouts = useMemo(
		() => infiniteData?.pages.flat() ?? [],
		[infiniteData],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);
	const renderPayoutItem = useCallback(
		({ item }: { item: Payout }) => (
			<PayoutListItem payout={item} businessId={businessId} />
		),
		[businessId],
	);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	// Balance cards are exact (unfiltered aggregate); the list itself is
	// server-filtered by status.
	const paid = totals?.paid ?? 0;
	const paidCount = totals?.paidCount ?? 0;
	const pending = totals?.pending ?? 0;

	return (
		<Screen>
			{pull.indicator}
			<FlatList
				ref={pull.ref}
				data={payouts}
				keyExtractor={(payout) => payout.id}
				contentContainerStyle={styles.container}
				keyboardShouldPersistTaps="handled"
				onEndReached={handleEndReached}
				onEndReachedThreshold={0.5}
				refreshControl={
					<RefreshControl
						refreshing={isFetching}
						onRefresh={() => {
							void refetch();
							void refetchTotals();
						}}
						tintColor={colors.primary}
						colors={[colors.primary]}
					/>
				}
				ListHeaderComponent={
					<>
						<ScreenHeader
							title={strings.business.paymentsTitle}
							fallback="/(business)/management"
						/>
						<AppText
							variant="bodySmall"
							style={{ color: colors.mutedForeground, marginTop: spacing.lg }}
						>
							{strings.business.paymentsSubtitle}
						</AppText>

						{/* ── Balance cards ─────────────────────────────────── */}
						<View style={styles.balances}>
							<View
								style={[
									styles.balanceCard,
									{
										backgroundColor: colors.surfaceSuccess,
										borderColor: colors.surfaceSuccessBorder,
									},
								]}
							>
								<AppText
									variant="labelSmall"
									weight="bold"
									style={{ color: colors.successDark }}
								>
									{strings.business.totalCollected}
								</AppText>
								<AppText variant="h2" weight="bold" style={{ color: colors.successDark }}>
									{formatMoney(paid)}
								</AppText>
								<AppText variant="bodySmall" style={{ color: colors.successDark }}>
									{paidCount === 1
										? strings.business.onePayout
										: `${paidCount} ${strings.business.payoutsCount}`}
								</AppText>
							</View>
							<View
								style={[
									styles.balanceCard,
									{
										backgroundColor: colors.infoSurface,
										borderColor: colors.infoSurfaceBorder,
									},
								]}
							>
								<AppText
									variant="labelSmall"
									weight="bold"
									style={{ color: colors.infoForeground }}
								>
									{strings.business.pendingProcessing}
								</AppText>
								<AppText variant="h2" weight="bold" style={{ color: colors.infoForeground }}>
									{formatMoney(pending)}
								</AppText>
								<AppText variant="bodySmall" style={{ color: colors.infoForeground }}>
									{strings.business.autoCutoff}
								</AppText>
							</View>
						</View>

						{/* ── Filter chips ────────────────────────────────── */}
						<View style={styles.filters}>
							{FILTERS.map((option) => {
								const selected = option.key === filter;
								return (
									<Pressable
										key={option.key}
										onPress={() => setFilter(option.key)}
										style={[
											styles.filterChip,
											selected && {
												backgroundColor: colors.foreground,
												borderColor: colors.foreground,
											},
											!selected && { borderColor: colors.borderSolid },
										]}
									>
										<AppText
											variant="bodySmall"
											weight={selected ? "bold" : "medium"}
											style={{
												color: selected
													? colors.background
													: colors.mutedForeground,
											}}
										>
											{option.label}
										</AppText>
									</Pressable>
								);
							})}
						</View>
					</>
				}
				ListEmptyComponent={
					<EmptyState
						icon={
							<Receipt
								size={28}
								color={colors.mutedForeground}
							/>
						}
						title={strings.business.noPayouts}
						message={strings.business.noPayoutsBody}
					/>
				}
				ListFooterComponent={
					<>
						{isFetchingNextPage ? (
							<ActivityIndicator color={colors.primary} />
						) : null}
						{/* ── Cycle info card ─────────────────────────────── */}
						<View
							style={[
								styles.cycleInfo,
								{ backgroundColor: colors.surfaceMuted },
							]}
						>
							<Info
								size={16}
								color={colors.mutedForeground}
							/>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground, flex: 1 }}
							>
								{strings.business.payoutCycleInfo}
							</AppText>
						</View>
					</>
				}
				renderItem={renderPayoutItem}
				ItemSeparatorComponent={() => <View style={styles.separator} />}
			/>
		</Screen>
	);
}

const PayoutListItem = memo(function PayoutListItem({
	payout,
	businessId,
}: {
	payout: Payout;
	businessId: string;
}) {
	const handlePress = useCallback(
		() => router.push(`/business/${businessId}/payouts/${payout.id}`),
		[businessId, payout.id],
	);
	return <PayoutCard payout={payout} onPress={handlePress} />;
});

function PayoutCard({
	payout,
	onPress,
}: {
	payout: Payout;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<CardPressable onPress={onPress} style={styles.payoutCard}>
			<View style={styles.payoutRow}>
				<View style={styles.payoutInfo}>
					<View style={styles.payoutHeader}>
						<AppText variant="bodyMedium" weight="bold">
							{formatMoney(payout.net_amount)}
						</AppText>
						<StatusBadge
							label={PAYOUT_STATUS_LABELS[payout.status] ?? payout.status}
							tone={TONE[payout.status]}
						/>
					</View>
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{periodLabel(payout)}
					</AppText>
				</View>
				<ChevronRight
					size={16}
					color={colors.mutedForeground}
				/>
			</View>
		</CardPressable>
	);
}

function periodLabel(payout: Payout): string {
	const start = new Date(`${payout.period_start}T00:00:00`);
	const end = new Date(`${payout.period_end}T00:00:00`);
	if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
		return `${payout.period_start} - ${payout.period_end}`;
	}
	const months = [
		"ene", "feb", "mar", "abr", "may", "jun",
		"jul", "ago", "sep", "oct", "nov", "dic",
	];
	return `${months[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${start.getFullYear()}`;
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, flexGrow: 1 },
	balances: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
	balanceCard: {
		flex: 1,
		padding: spacing.md,
		borderRadius: radii.md,
		borderWidth: 1,
		gap: 2,
	},
	filters: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.lg },
	filterChip: {
		paddingHorizontal: spacing.md,
		paddingVertical: 6,
		borderRadius: radii.pill,
		borderWidth: 1,
	},
	list: { marginTop: spacing.md, gap: spacing.xs },
	separator: { height: spacing.xs },
	payoutCard: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
	payoutRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	payoutInfo: { flex: 1, gap: 2 },
	payoutHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	cycleInfo: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.sm,
		padding: spacing.md,
		borderRadius: radii.md,
		marginTop: spacing.lg,
	},
});