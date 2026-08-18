import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
	FlatList,
	Image,
	Pressable,
	RefreshControl,
	StyleSheet,
	View,
} from "react-native";

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
	StatusBadge,
} from "@/core/ui";
import { useFavorites, useToggleFavorite } from "@/features/hooks";
import { discountPercentage } from "@/features/offers/domain/offer";
import type { FavoriteOffer } from "@/features/favorites/data/repository";
import { formatMoney } from "@/core/utils/formatters";
import { spacing } from "@/core/theme/spacing";
import { useTheme } from "@/core/theme";

export default function FavoritesScreen() {
	const { colors } = useTheme();
	const { data, isLoading, isError, error, refetch, isFetching } = useFavorites();
	const toggle = useToggleFavorite();

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
				renderItem={({ item }) => <FavoriteCard item={item} />}
			/>
		</Screen>
	);
}

// ─── Card ────────────────────────────────────────────────────────────

function FavoriteCard({ item }: { item: FavoriteOffer }) {
	const { colors } = useTheme();
	const toggle = useToggleFavorite();
	const discount = discountPercentage({
		original_price: item.originalPrice,
		discounted_price: item.discountedPrice,
	});

	return (
		<Card onPress={() => router.push(`/offer/${item.offerId}`)}>
			<View style={styles.row}>
				{item.imageUrl ? (
					<Image source={{ uri: item.imageUrl }} style={styles.image} />
				) : (
					<View
						style={[
							styles.image,
							styles.imageFallback,
							{ backgroundColor: colors.muted },
						]}
					>
						<Ionicons
							name="storefront-outline"
							size={26}
							color={colors.mutedForeground}
						/>
					</View>
				)}

				<View style={styles.body}>
					<View style={styles.topRow}>
						<AppText
							variant="labelSmall"
							weight="semiBold"
							numberOfLines={1}
							style={[styles.business, { color: colors.mutedForeground }]}
						>
							{item.businessName}
						</AppText>
						<Pressable
							onPress={() => toggle.mutate(item.offerId)}
							hitSlop={8}
							accessibilityRole="button"
							accessibilityLabel={strings.offers.removeFromFavorites}
							style={[
								styles.heartBtn,
								{ backgroundColor: colors.redAccent + "26" },
							]}
						>
							<Ionicons name="heart" size={15} color={colors.redAccent} />
						</Pressable>
					</View>

					<AppText variant="h4" weight="bold" numberOfLines={2}>
						{item.title}
					</AppText>

					<View style={styles.priceRow}>
						<AppText variant="price" style={{ color: colors.primary }}>
							{formatMoney(item.discountedPrice)}
						</AppText>
						<AppText
							variant="bodySmall"
							style={{
								textDecorationLine: "line-through",
								color: colors.mutedForeground,
							}}
						>
							{formatMoney(item.originalPrice)}
						</AppText>
						<StatusBadge label={`${discount}%`} tone="brand" />
					</View>

					<View style={styles.metaRow}>
						<Ionicons name="star" size={14} color={colors.warning} />
						<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
							{item.rating.toFixed(1)}
						</AppText>
						{item.address ? (
							<AppText
								variant="bodySmall"
								numberOfLines={1}
								style={[styles.address, { color: colors.mutedForeground }]}
							>
								{item.address}
							</AppText>
						) : null}
					</View>
				</View>
			</View>
		</Card>
	);
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
	row: { flexDirection: "row", alignItems: "stretch" },
	image: { width: 96, height: 96, borderRadius: 16 },
	imageFallback: { alignItems: "center", justifyContent: "center" },
	body: { flex: 1, marginLeft: spacing.md, gap: 4 },
	topRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
	business: { flex: 1 },
	heartBtn: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
	},
	priceRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
		marginTop: 2,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		marginTop: 2,
	},
	address: { flex: 1 },
});