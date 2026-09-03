import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Card,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
	StatusBadge,
} from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { useBusinessPayouts } from "@/features/business/hooks";
import { PAYOUT_STATUS_LABELS } from "@/features/business/domain/business";
import { formatMoney } from "@/core/utils/formatters";
import type { Payout, PayoutStatus } from "@0xc1x/role-commons";
import type { BadgeTone } from "@/core/ui";

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
	const { data, isLoading, isError, error, refetch } =
		useBusinessPayouts(businessId);
	const [filter, setFilter] = useState<PayoutFilter>("all");

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!data) return null;

	let paid = 0;
	let paidCount = 0;
	let pending = 0;
	for (const payout of data) {
		if (payout.status === "paid") {
			paid += payout.net_amount;
			paidCount += 1;
		} else if (
			payout.status === "pending" ||
			payout.status === "processing"
		) {
			pending += payout.net_amount;
		}
	}

	const filtered =
		filter === "all"
			? data
			: data.filter((p) => p.status === filter);

	return (
		<Screen scroll>
			<View style={styles.container}>
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

				{/* ── Payout list ─────────────────────────────────── */}
				{filtered.length === 0 ? (
					<EmptyState
						icon={
							<Ionicons
								name="receipt-outline"
								size={28}
								color={colors.mutedForeground}
							/>
						}
						title={strings.business.noPayouts}
						message={strings.business.noPayoutsBody}
					/>
				) : (
					<View style={styles.list}>
						{filtered.map((payout) => (
							<PayoutCard
								key={payout.id}
								payout={payout}
								onPress={() =>
									router.push(
										`/business/${businessId}/payouts/${payout.id}`,
									)
								}
							/>
						))}
					</View>
				)}

				{/* ── Cycle info card ─────────────────────────────── */}
				<View
					style={[
						styles.cycleInfo,
						{ backgroundColor: colors.surfaceMuted },
					]}
				>
					<Ionicons
						name="information-circle-outline"
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
			</View>
		</Screen>
	);
}

function PayoutCard({
	payout,
	onPress,
}: {
	payout: Payout;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Card onPress={onPress} style={styles.payoutCard}>
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
				<Ionicons
					name="chevron-forward"
					size={16}
					color={colors.mutedForeground}
				/>
			</View>
		</Card>
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
	container: { padding: spacing.xl, flex: 1 },
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