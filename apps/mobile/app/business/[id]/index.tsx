import { type Href, router, useLocalSearchParams } from "expo-router";
import { FlatList, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card, ErrorState, LoadingView, Screen } from "@/core/ui";
import { useBusinessProfile } from "@/features/business/hooks";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

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

	if (isLoading) return <LoadingView />;
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
		{
			label: strings.business.payments,
			route: `/business/${businessId}/payouts`,
		},
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
					renderItem={({ item }) => (
						<Card onPress={() => router.push(item.route as Href)}>
							<View style={styles.rowBetween}>
								<AppText variant="bodyMedium">{item.label}</AppText>
								<AppText variant="bodyMedium" style={{ color: "gray" }}>
									›
								</AppText>
							</View>
						</Card>
					)}
				/>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	container: { padding: spacing.xl, flex: 1 },
	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
});
