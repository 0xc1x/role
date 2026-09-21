import { type Href, router, useLocalSearchParams } from "expo-router";
import { memo, useCallback } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText, ErrorState, Screen } from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useBusinessProfile } from "@/src/features/business/hooks";
import { BUSINESS_TYPE_LABELS } from "@/src/features/business/domain/business";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { Card } from "@/components/ui/card";
import { CardPressable } from "@/components/ui/card-presable";

export default function BusinessHubScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const businessId = id ?? "";
	const {
		data: profile,
		isLoading,
		isError,
		error,
		refetch,
	} = useBusinessProfile(businessId);

	const handleMenuPress = useCallback((route: string) => {
		router.push(route as Href);
	}, []);

	const renderItem = useCallback(
		({ item }: { item: { label: string; route: string } }) => (
			<MenuRow label={item.label} route={item.route} onPress={handleMenuPress} />
		),
		[handleMenuPress],
	);

	if (isLoading) {
		return (
			<Screen scroll>
				<View style={[styles.container, styles.skeletonWrap]}>
					<Skeleton style={styles.skeletonTitle} />
					<Skeleton style={styles.skeletonSubtitle} />
					<Skeleton style={styles.skeletonCard} />
					{[0, 1, 2].map((i) => (
						<Skeleton key={`hub-menu-skeleton-${i}`} style={styles.skeletonRow} />
					))}
				</View>
			</Screen>
		);
	}
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;
	if (!profile) return null;

	const business = profile.business;
	const menu = [
		{
			label: strings.business.products,
			route: `/business/${businessId}/offers`,
		},
		{ label: strings.business.orders, route: "/orders" },
		{
			label: strings.business.locations,
			route: `/business/${businessId}/locations`,
		},
		{
			label: strings.business.coupons,
			route: `/business/${businessId}/coupons`,
		},
		// Oculto hasta habilitar la pasarela de pagos
		// {
		// 	label: strings.business.payments,
		// 	route: `/business/${businessId}/payouts`,
		// },
		{
			label: strings.business.notifications,
			route: `/business/${businessId}/notifications`,
		},
		{
			label: strings.business.statistics,
			route: `/business/${businessId}/stats`,
		},
	];

	return (
		<Screen scroll>
			<View style={styles.container}>
				<AppText variant="h2" weight="bold">
					{business.name}
				</AppText>
				<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
					{BUSINESS_TYPE_LABELS[business.type] ?? business.type} ·{" "}
					{profile.totalRescued} rescatados · ⭐{" "}
					{(business.rating ?? 0).toFixed(1)}
				</AppText>

				<Card style={{ marginTop: spacing.lg, gap: spacing.xs }}>
					<AppText
						variant="labelSmall"
						weight="semiBold"
						style={{ color: colors.mutedForeground }}
					>
						{strings.business.profile}
					</AppText>
					{profile.hours.length > 0
						? profile.hours.map((h) => (
								<View key={h.dayRange} style={styles.rowBetween}>
									<AppText variant="bodySmall">{h.dayRange}</AppText>
									<AppText
										variant="bodySmall"
										style={{ color: colors.mutedForeground }}
									>
										{h.hoursDisplay}
									</AppText>
								</View>
							))
						: null}
					<AppText
						variant="bodySmall"
						style={{ color: colors.mutedForeground }}
					>
						{profile.address ?? "Sin dirección registrada"}
					</AppText>
				</Card>

				<FlatList
					data={menu}
					style={{ marginTop: spacing.lg }}
					scrollEnabled={false}
					keyExtractor={(item) => item.label}
					ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
					renderItem={renderItem}
				/>
			</View>
		</Screen>
	);
}

const MenuRow = memo(function MenuRow({
	label,
	route,
	onPress,
}: {
	label: string;
	route: string;
	onPress: (route: string) => void;
}) {
	const { colors } = useTheme();
	return (
		<CardPressable onPress={() => onPress(route)}>
			<View style={styles.rowBetween}>
				<AppText variant="bodyMedium" numberOfLines={1} style={styles.menuLabel}>
					{label}
				</AppText>
				<View style={styles.menuChevron}>
					<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
						›
					</AppText>
				</View>
			</View>
		</CardPressable>
	);
});

const styles = StyleSheet.create({
	container: { padding: spacing.xl, flex: 1 },
	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	menuLabel: { flex: 1, minWidth: 0 },
	menuChevron: { flexShrink: 0 },
	skeletonTitle: { height: 28, width: "60%", borderRadius: radii.md },
	skeletonSubtitle: { height: 16, width: "80%", borderRadius: radii.md },
	skeletonCard: { height: 120, borderRadius: radii.lg, marginTop: spacing.md },
	skeletonRow: { height: 56, borderRadius: radii.lg },
	skeletonWrap: { gap: spacing.md },
});
