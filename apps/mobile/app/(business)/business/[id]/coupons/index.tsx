import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	Card,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
} from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { useBusinessCoupons } from "@/features/business/hooks";
import { CouponCard } from "@/features/business/components/CouponCard";
import { couponIsValid } from "@/features/orders/domain/order";

function StatCard({
	label,
	value,
	color,
}: {
	label: string;
	value: string;
	color: string;
}) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.stat,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
			]}
		>
			<AppText
				variant="bodySmall"
				style={{ fontSize: 10, color: colors.mutedForeground }}
			>
				{label}
			</AppText>
			<AppText variant="h3" weight="bold" style={{ color }}>
				{value}
			</AppText>
		</View>
	);
}

export default function BusinessCouponsScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const { data, isLoading, isError, error, refetch } =
		useBusinessCoupons(businessId);

	return (
		<Screen scroll>
			<View style={styles.container}>
				<ScreenHeader title={strings.business.coupons} />
				<AppText
					variant="bodySmall"
					style={{ color: colors.mutedForeground, marginTop: 4 }}
				>
					{strings.business.couponsSubtitle}
				</AppText>

				<Button
					label={strings.business.couponNew}
					size="sm"
					icon={<Ionicons name="add" size={18} color="#fff" />}
					style={styles.newButton}
					onPress={() =>
						router.push(`/business/${businessId}/coupons/new`)
					}
				/>

				{isLoading ? (
					<LoadingView />
				) : isError ? (
					<ErrorState error={error} onRetry={() => void refetch()} />
				) : !data ? (
					<LoadingView />
				) : (
					<>
						<View style={styles.stats}>
							<StatCard
								label={strings.business.couponsActiveStat}
								value={String(
									data.filter((c) => couponIsValid(c)).length,
								)}
								color={colors.successDark}
							/>
							<StatCard
								label={strings.business.couponsUsesStat}
								value={String(
									data.reduce((sum, c) => sum + c.used_count, 0),
								)}
								color={colors.primary}
							/>
							<StatCard
								label={strings.business.couponsCreatedStat}
								value={String(data.length)}
								color={colors.foreground}
							/>
						</View>

						{data.length === 0 ? (
							<Card style={styles.emptyCard}>
								<EmptyState
									icon={
										<Ionicons
											name="pricetag-outline"
											size={40}
											color={colors.mutedForeground}
										/>
									}
									title={strings.business.noCoupons}
									message={strings.business.noCouponsBody}
									action={
										<Button
											label={strings.business.couponCreateFirst}
											onPress={() =>
												router.push(
													`/business/${businessId}/coupons/new`,
												)
											}
											style={{ marginTop: spacing.md }}
										/>
									}
								/>
							</Card>
						) : (
							<>
								<AppText
									variant="labelSmall"
									weight="bold"
									style={{ marginTop: spacing.lg, marginBottom: spacing.md }}
								>
									{strings.business.couponsHistory}
								</AppText>
								{data.map((coupon) => (
									<CouponCard
										key={coupon.id}
										coupon={coupon}
										businessId={businessId}
									/>
								))}
							</>
						)}

						<View
							style={[
								styles.tips,
								{
									marginTop: spacing.lg,
									backgroundColor: colors.surfaceMuted,
								},
							]}
						>
							<AppText variant="labelSmall" weight="bold" style={{ marginBottom: spacing.sm }}>
								{strings.business.couponTipsTitle}
							</AppText>
							{strings.business.couponTips.map((tip) => (
								<View key={tip} style={styles.tip}>
									<Ionicons
										name="checkmark-circle-outline"
										size={14}
										color={colors.success}
									/>
									<AppText
										variant="bodySmall"
										style={{ color: colors.mutedForeground, flex: 1 }}
									>
										{tip}
									</AppText>
								</View>
							))}
						</View>
					</>
				)}
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, flex: 1 },
	newButton: { alignSelf: "flex-end", marginTop: spacing.md },
	stats: {
		flexDirection: "row",
		gap: spacing.sm,
		marginTop: spacing.lg,
	},
	stat: {
		flex: 1,
		padding: spacing.md,
		borderRadius: radii.md,
		borderWidth: 1,
		gap: 2,
	},
	emptyCard: { marginTop: spacing.xl },
	tips: {
		padding: spacing.md,
		borderRadius: radii.md,
		gap: spacing.sm,
	},
	tip: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: spacing.xs,
	},
});