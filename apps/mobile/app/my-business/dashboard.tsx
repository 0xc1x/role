import { router } from "expo-router";
import { memo, useCallback } from "react";
import { FlatList, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
	StatusBadge,
} from "@/src/core/ui";
import { useAuthStore } from "@/src/features/auth/store";
import { useBusinesses } from "@/src/features/business/hooks";
import { BUSINESS_TYPE_LABELS } from "@/src/features/business/domain/business";
import { spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { CardPressable } from "@/components/ui/card-presable";
import { Button } from "@/components/ui/button";

export default function BusinessDashboardScreen() {
	const profile = useAuthStore((s) => s.profile);
	const {
		data: businesses,
		isLoading,
		isError,
		error,
		refetch,
	} = useBusinesses(profile?.id ?? "");

	const handleBusinessPress = useCallback((businessId: string) => {
		router.push(`/business/${businessId}`);
	}, []);

	const renderItem = useCallback(
		({ item }: { item: NonNullable<typeof businesses>[number] }) => (
			<BusinessCardRow item={item} onPress={handleBusinessPress} />
		),
		[handleBusinessPress],
	);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	return (
		<Screen>
			<View style={styles.header}>
				<AppText variant="h2" weight="bold">
					{strings.myBusiness.dashboardTitle}
				</AppText>
				<Button size="sm" onPress={() => router.push("/business-signup")}>
					{strings.myBusiness.newBusiness}
				</Button>
			</View>

			{!businesses || businesses.length === 0 ? (
				<EmptyState
					title={strings.myBusiness.emptyTitle}
					message={strings.myBusiness.emptyBody}
				/>
			) : (
				<FlatList
					data={businesses}
					keyExtractor={(item) => item.id}
					contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
					renderItem={renderItem}
				/>
			)}
		</Screen>
	);
}

const BusinessCardRow = memo(function BusinessCardRow({
	item,
	onPress,
}: {
	item: NonNullable<ReturnType<typeof useBusinesses>["data"]>[number];
	onPress: (businessId: string) => void;
}) {
	const { colors } = useTheme();
	return (
		<CardPressable onPress={() => onPress(item.id)}>
			<AppText variant="h4" weight="bold">
				{item.name}
			</AppText>
			<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
				{BUSINESS_TYPE_LABELS[item.type] ?? item.type}
			</AppText>
			<View style={{ marginTop: spacing.sm }}>
				<StatusBadge
					label={
						item.is_active ? strings.business.active : strings.business.inactive
					}
					tone={item.is_active ? "success" : "neutral"}
				/>
			</View>
		</CardPressable>
	);
});

const styles = StyleSheet.create({
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: spacing.xl,
		paddingTop: spacing.lg,
		marginBottom: spacing.md,
		gap: spacing.md,
	},
});
