import { router } from "expo-router";
import { memo, useCallback, useEffect, useMemo } from "react";
import {
	ActivityIndicator,
	FlatList,
	RefreshControl,
	StyleSheet,
	View,
} from "react-native";
import { Heart } from "lucide-react-native";

import { strings } from "@/src/core/i18n/strings";
import {
	AppText,
	EmptyState,
	ErrorState,
	Screen,
	ScreenHeader,
	useWebPullToRefresh,
} from "@/src/core/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/src/features/auth/store";
import { useFavorites } from "@/src/features/hooks";
import type { OfferDetail } from "@/src/features/offers/domain/offer";
import { OfferCard } from "@/src/features/offers/components/OfferCard";
import type { FavoriteOffer } from "@/src/features/favorites/data/repository";
import { formatMoney } from "@/src/core/utils/formatters";
import { spacing, radii } from "@/src/core/theme/spacing";
import { useTheme } from "@/src/core/theme";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function FavoritesScreen() {
	const { colors } = useTheme();
	const { status, initialized } = useAuthStore();
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
	} = useFavorites();
	const pull = useWebPullToRefresh({
		onRefresh: () => void refetch(),
		refreshing: isFetching,
	});
	// Redirect guests to login
	useEffect(() => {
		if (initialized && status === "guest") {
			router.replace("/login");
		}
	}, [status, initialized]);

	const favorites = useMemo(
		() => infiniteData?.pages.flat() ?? [],
		[infiniteData],
	);

	const handleEndReached = useCallback(() => {
		if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const renderItem = useCallback(
		({ item }: { item: FavoriteOffer }) => <FavoriteRow item={item} />,
		[],
	);

	if (!initialized || status === "guest") return null;
	if (isLoading) {
		return (
			<Screen>
				<View style={styles.list}>
					<ScreenHeader
						title={strings.favorites.title}
						fallback="/(consumer)/profile"
						style={{ marginBottom: spacing.lg }}
					/>
					{[0, 1].map((i) => (
						<Skeleton
							key={`favorite-skeleton-${i}`}
							style={{ height: 256, borderRadius: radii.lg }}
						/>
					))}
				</View>
			</Screen>
		);
	}
	if (isError) return <ErrorState error={error} onRetry={refetch} />;

	// Savings banner reflects loaded pages (grows as the user scrolls).
	const totalSaved = favorites.reduce(
		(sum, f) => sum + Math.max(0, f.originalPrice - f.discountedPrice),
		0,
	);

	return (
		<Screen>
			{pull.indicator}
			<FlatList
				ref={pull.ref}
				data={favorites}
				keyExtractor={(item) => item.favoriteId}
				contentContainerStyle={styles.list}
				keyboardShouldPersistTaps="handled"
				onEndReached={handleEndReached}
				onEndReachedThreshold={0.5}
				refreshControl={
					<RefreshControl
						refreshing={isFetching}
						onRefresh={() => void refetch()}
						tintColor={colors.primary}
						colors={[colors.primary]}
					/>
				}
				ListFooterComponent={
					isFetchingNextPage ? (
						<ActivityIndicator color={colors.primary} />
					) : null
				}
				ListHeaderComponent={
					<>
						<ScreenHeader
							title={strings.favorites.title}
							fallback="/(consumer)/profile"
							style={{ marginBottom: spacing.lg }}
						/>
						{favorites.length > 0 ? (
							<Alert variant="success" icon={Heart}>
								<AlertDescription>
									<AppText style={[styles.bannerText, { color: colors.success }]}>
										{strings.favorites.savingsBanner.replace(
											"{saved}",
											formatMoney(totalSaved),
										)}
									</AppText>
								</AlertDescription>
							</Alert>
						) : null}
					</>
				}
				ListEmptyComponent={
					<EmptyState
						icon={
							<Heart
								size={28}
								color={colors.mutedForeground}
							/>
						}
						title={strings.favorites.empty}
						message={strings.favorites.emptyHint}
						action={
							<Button
								onPress={() => router.replace("/")}
								fullWidth
								style={styles.exploreBtn}
							>
								{strings.favorites.explore}
							</Button>
						}
					/>
				}
			renderItem={renderItem}
		/>
	</Screen>
	);
}

const FavoriteRow = memo(function FavoriteRow({ item }: { item: FavoriteOffer }) {
	return <OfferCard offer={toOfferDetail(item)} />;
});

// ─── Mapper ──────────────────────────────────────────────────────────

/** FavoriteOffer → OfferDetail para reusar la card canónica de ofertas. */
function toOfferDetail(item: FavoriteOffer): OfferDetail {
	return {
		offer: {
			id: item.offerId,
			business_id: item.businessId,
			business_location_id: "",
			title: item.title,
			description: null,
			image: item.imageUrl,
			category_ids: [],
			original_price: item.originalPrice,
			discounted_price: item.discountedPrice,
			discount_percentage: null,
			// Disponibilidad real de la proyección; si la oferta embebida
			// no llegó, `availabilityUnknown` oculta estos campos en la UI.
			stock: item.stock,
			initial_stock: item.stock,
			pickup_start: item.pickupStart,
			pickup_end: item.pickupEnd,
			is_active: item.isActive,
			includes: null,
			allergens: null,
			rating: item.rating,
			review_count: 0,
			created_at: "",
			updated_at: "",
		},
		business: {
			id: "",
			name: item.businessName,
			type: "other",
			image: null,
			rating: item.rating,
			review_count: 0,
		},
		location: null,
		categories: item.categories,
		availabilityUnknown: item.availabilityUnknown,
	};
}

const styles = StyleSheet.create({
	list: { padding: spacing.xl, gap: spacing.md },
	bannerText: { flex: 1, fontSize: 13, fontWeight: "600" },
	exploreBtn: { marginTop: spacing.lg },
});