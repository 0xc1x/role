import { router, useLocalSearchParams } from "expo-router";
import { memo, useCallback, useMemo } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { Image } from "expo-image";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
	StatusBadge,
} from "@/src/core/ui";
import { useBusinessOffers } from "@/src/features/business/hooks";
import type { OfferDetail } from "@/src/features/offers/domain/offer";
import { discountPercentage } from "@/src/features/offers/domain/offer";
import { formatMoney } from "@/src/core/utils/formatters";
import { radii, spacing } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { Button } from "@/components/ui/button";
import { CardPressable } from "@/components/ui/card-presable";

/** Business offer list (from hub menu). */
export default function BusinessOffersScreen() {
	const { colors } = useTheme();
	const { id } = useLocalSearchParams<{ id: string }>();
	const {
		data: infiniteData,
		isLoading,
		isError,
		error,
		refetch,
		fetchNextPage,
		hasNextPage,
		isFetchingNextPage,
	} = useBusinessOffers(id ?? "");

	const items = useMemo(
		() => infiniteData?.pages.flat() ?? [],
		[infiniteData],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const renderItem = useCallback(
		({ item }: { item: OfferDetail }) => (
			<BusinessOfferRow item={item} businessId={id ?? ""} />
		),
		[id],
	);

	if (isLoading) return <LoadingView />;
	if (isError)
		return <ErrorState error={error} onRetry={() => void refetch()} />;

	return (
		<Screen>
			<View style={styles.header}>
				<AppText variant="h2" weight="bold">
					{strings.business.products}
				</AppText>
				<Button
					size="sm"
					onPress={() => router.push(`/business/${id}/offer/new`)}
				>
					{strings.business.newProduct}
				</Button>
			</View>
		{items.length === 0 ? (
			<EmptyState
				title="Sin productos aún"
				message="Publica tu primer excedente de comida."
			/>
		) : (
			<FlatList
				data={items}
				keyExtractor={(item) => item.offer.id}
				contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
				renderItem={renderItem}
				onEndReached={handleEndReached}
				onEndReachedThreshold={0.5}
				ListFooterComponent={
					isFetchingNextPage ? (
						<ActivityIndicator color={colors.primary} />
					) : null
				}
			/>
		)}
		</Screen>
	);
}

const BusinessOfferRow = memo(function BusinessOfferRow({
	item,
	businessId,
}: {
	item: OfferDetail;
	businessId: string;
}) {
	const { colors } = useTheme();
	const discount = discountPercentage(item.offer);
	return (
		<CardPressable
			onPress={() => router.push(`/business/${businessId}/offer/${item.offer.id}`)}
		>
			<View style={styles.row}>
				{item.offer.image ? (
					<Image source={{ uri: item.offer.image }} style={styles.image} />
				) : null}
				<View style={styles.offerBody}>
					<AppText variant="h4" weight="bold" numberOfLines={1}>
						{item.offer.title}
					</AppText>
					<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
						{formatMoney(item.offer.discounted_price)} · {discount}% OFF
					</AppText>
					<StatusBadge
						label={item.offer.is_active ? "Activo" : "Inactivo"}
						tone={item.offer.is_active ? "success" : "neutral"}
					/>
				</View>
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
	},
	row: { flexDirection: "row", gap: spacing.md },
	offerBody: { flex: 1, gap: 2 },
	image: { width: 64, height: 64, borderRadius: radii.sm },
});
