import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import {
	AppText,
	Button,
	EmptyState,
	ErrorState,
	LoadingView,
	Screen,
	ScreenHeader,
} from "@/core/ui";
import { useFavorites } from "@/features/hooks";
import type { OfferDetail } from "@/features/offers/domain/offer";
import { OfferCard } from "@/features/offers/components/OfferCard";
import type { FavoriteOffer } from "@/features/favorites/data/repository";
import { formatMoney } from "@/core/utils/formatters";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export default function FavoritesScreen() {
	const { colors } = useTheme();
	const { data, isLoading, isError, error, refetch, isFetching } = useFavorites();

	if (isLoading) return <LoadingView />;
	if (isError) return <ErrorState error={error} onRetry={refetch} />;

	const favorites = data ?? [];
	const totalSaved = favorites.reduce(
		(sum, f) => sum + Math.max(0, f.originalPrice - f.discountedPrice),
		0,
	);

	return (
		<Screen>
			<FlatList
				data={favorites}
				keyExtractor={(item) => item.favoriteId}
				contentContainerStyle={styles.list}
				keyboardShouldPersistTaps="handled"
				refreshControl={
					<RefreshControl
						refreshing={isFetching}
						onRefresh={() => void refetch()}
						tintColor={colors.primary}
						colors={[colors.primary]}
					/>
				}
				ListHeaderComponent={
					<>
						<ScreenHeader
							title={strings.favorites.title}
							style={{ marginBottom: spacing.lg }}
						/>
						{favorites.length > 0 ? (
							<View
								style={[
									styles.banner,
									{
										backgroundColor: colors.secondary + "26",
										borderColor: colors.secondary + "4D",
									},
								]}
							>
								<Ionicons name="heart" size={18} color={colors.primary} />
								<AppText style={[styles.bannerText, { color: colors.primary }]}>
									{strings.favorites.savingsBanner.replace(
										"{saved}",
										formatMoney(totalSaved),
									)}
								</AppText>
							</View>
						) : null}
					</>
				}
				ListEmptyComponent={
					<EmptyState
						icon={
							<Ionicons
								name="heart-outline"
								size={28}
								color={colors.mutedForeground}
							/>
						}
						title={strings.favorites.empty}
						message={strings.favorites.emptyHint}
						action={
							<Button
								label={strings.favorites.explore}
								onPress={() => router.replace("/")}
								fullWidth
								style={styles.exploreBtn}
							/>
						}
					/>
				}
				renderItem={({ item }) => <OfferCard offer={toOfferDetail(item)} />}
			/>
		</Screen>
	);
}

// ─── Mapper ──────────────────────────────────────────────────────────

/** FavoriteOffer → OfferDetail para reusar la card canónica de ofertas. */
function toOfferDetail(item: FavoriteOffer): OfferDetail {
	return {
		offer: {
			id: item.offerId,
			business_id: "",
			business_location_id: "",
			title: item.title,
			description: null,
			image: item.imageUrl,
			category_ids: [],
			original_price: item.originalPrice,
			discounted_price: item.discountedPrice,
			discount_percentage: null,
			// Sin datos de stock/pickup en la proyección de favoritos: neutros
			// para que la card no muestre esos badges.
			stock: 999,
			initial_stock: 999,
			pickup_start: "",
			pickup_end: "",
			is_active: true,
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
	};
}

const styles = StyleSheet.create({
	list: { padding: spacing.xl, gap: spacing.md },
	banner: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		borderWidth: 1,
		borderRadius: 16,
		padding: spacing.md,
		marginBottom: spacing.md,
	},
	bannerText: { flex: 1, fontSize: 13, fontWeight: "600" },
	exploreBtn: { marginTop: spacing.lg },
});