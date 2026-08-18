import { useRef } from "react";
import { View, StyleSheet, FlatList, Image, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withSequence,
	withSpring,
	withTiming,
	Easing,
} from "react-native-reanimated";

import { useTheme } from "@/core/theme";
import { AppText, Card, SectionHeader } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";
import { strings } from "@/core/i18n/strings";
import {
	usePopularOffers,
	useExpiringSoonOffers,
	useRecentOffers,
	useNearbyOffersHook,
	useSelectedAddress,
	useIsFavorite,
	useToggleFavorite,
} from "@/features/hooks";
import { formatDistanceKm, formatTime } from "@/core/utils/formatters";
import {
	discountPercentage,
	haversineKm,
	type OfferDetail,
} from "@/features/offers/domain/offer";
import { useAuthStore } from "@/features/auth/store";

type SectionType = "popular" | "expiring" | "recent" | "nearby";

interface OfferRowSectionProps {
	type: SectionType;
	title: string;
	icon?: React.ReactNode;
	limit?: number;
	category?: string | null;
	onSeeAll?: () => void;
}

function dealPrice(value: number): string {
	return `$${value.toFixed(2)}`;
}

function AnimatedHeartButton({
	isFavorite,
	onPress,
}: {
	isFavorite: boolean;
	onPress: () => void;
}) {
	const { colors } = useTheme();
	const scale = useSharedValue(1);
	const prevFavorite = useRef(isFavorite);

	useEffect(() => {
		if (prevFavorite.current !== isFavorite) {
			prevFavorite.current = isFavorite;
			scale.value = withSequence(
				withTiming(0.65, {
					duration: 100,
					easing: Easing.in(Easing.quad),
				}),
				withTiming(1.4, {
					duration: 160,
					easing: Easing.out(Easing.quad),
				}),
				withSpring(1, { damping: 12, stiffness: 200 }),
			);
		}
	}, [isFavorite, scale]);

	const heartStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
	}));

	return (
		<Animated.View style={heartStyle}>
			<Pressable
				onPress={onPress}
				hitSlop={6}
				style={[
					styles.heartCircle,
					{
						backgroundColor: isFavorite
							? colors.destructive + "26"
							: colors.card + "E8",
					},
				]}
			>
				<Ionicons
					name={isFavorite ? "heart" : "heart-outline"}
					size={18}
					color={
						isFavorite ? colors.destructiveVibrant : colors.mutedForeground
					}
				/>
			</Pressable>
		</Animated.View>
	);
}

function OfferCard({ offer }: { offer: OfferDetail }) {
	const { colors } = useTheme();
	const profile = useAuthStore((s) => s.profile);
	const selectedAddress = useSelectedAddress();
	const isFavorite = useIsFavorite(offer.offer.id);
	const toggleFavorite = useToggleFavorite();

	const discount = Math.round(discountPercentage(offer.offer));
	const distance =
		selectedAddress?.latitude != null &&
		selectedAddress?.longitude != null &&
		offer.location != null
			? formatDistanceKm(
					haversineKm(
						selectedAddress.latitude,
						selectedAddress.longitude,
						offer.location.latitude,
						offer.location.longitude,
					),
				)
			: "";
	const pickupTime = offer.offer.pickup_end
		? formatTime(offer.offer.pickup_end)
		: "";

	return (
		<Card
			style={styles.offerCard}
			onPress={() => router.push(`/offer/${offer.offer.id}`)}
		>
			<View style={styles.offerImageWrap}>
				{offer.offer.image ? (
					<Image
						source={{ uri: offer.offer.image }}
						style={styles.offerImage}
						resizeMode="cover"
					/>
				) : (
					<View style={[styles.offerImage, styles.offerImagePlaceholder]} />
				)}
				{discount > 0 && (
					<View style={[styles.discountBadge, { backgroundColor: colors.primary }]}>
						<AppText
							style={{
								color: colors.primaryForeground,
								fontSize: 12,
								fontWeight: "700",
							}}
						>
							-{discount}%
						</AppText>
					</View>
				)}
				{offer.offer.stock <= 3 && (
					<View
						style={[styles.lowStockBadge, { backgroundColor: colors.destructive }]}
					>
						<AppText
							style={{
								color: "#FFFFFF",
								fontSize: 11,
								fontWeight: "600",
							}}
						>
							{strings.offers.onlyLeft.replace(
								"{n}",
								String(offer.offer.stock),
							)}
						</AppText>
					</View>
				)}
				{profile && (
					<View style={styles.heartButton}>
						<AnimatedHeartButton
							isFavorite={isFavorite}
							onPress={() => toggleFavorite.mutate(offer.offer.id)}
						/>
					</View>
				)}
			</View>
			<View style={styles.offerBody}>
				<View style={styles.offerBodyRow}>
					<View style={styles.offerInfo}>
						<AppText
							variant="h4"
							weight="bold"
							numberOfLines={2}
							style={{ fontSize: 15, lineHeight: 19 }}
						>
							{offer.offer.title}
						</AppText>
						<View style={styles.metaRow}>
							<Ionicons
								name="location-outline"
								size={12}
								color={colors.mutedForeground}
							/>
							<AppText
								numberOfLines={1}
								style={{ color: colors.mutedForeground, fontSize: 11 }}
							>
								{distance
									? `${distance} · ${offer.business.name}`
									: offer.business.name}
							</AppText>
						</View>
						{pickupTime ? (
							<AppText
								style={{ color: colors.mutedForeground, fontSize: 11 }}
							>
								{strings.offers.pickupBefore.replace("{time}", pickupTime)}
							</AppText>
						) : null}
					</View>
					<View style={styles.offerPrice}>
						{offer.offer.original_price > 0 ? (
							<AppText
								style={{
									textDecorationLine: "line-through",
									color: colors.mutedForeground,
									fontSize: 12,
									lineHeight: 14,
								}}
							>
								{dealPrice(offer.offer.original_price)}
							</AppText>
						) : null}
						<AppText
							variant="priceLarge"
							style={{
								color: colors.primary,
								fontSize: 20,
								lineHeight: 24,
								fontWeight: "800",
							}}
						>
							{dealPrice(offer.offer.discounted_price)}
						</AppText>
					</View>
				</View>
			</View>
		</Card>
	);
}

function OfferSkeleton({ fullWidth = false }: { fullWidth?: boolean }) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.offerCardSkeleton,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
				fullWidth && styles.offerFull,
			]}
		>
			<View style={[styles.offerImage, { backgroundColor: colors.muted }]} />
			<View style={styles.offerBody}>
				<View
					style={{
						height: 14,
						width: "70%",
						backgroundColor: colors.muted,
						borderRadius: 4,
						marginBottom: 8,
					}}
				/>
				<View
					style={{
						height: 10,
						width: "55%",
						backgroundColor: colors.muted,
						borderRadius: 4,
						marginBottom: 8,
					}}
				/>
				<View
					style={{
						height: 10,
						width: "60%",
						backgroundColor: colors.muted,
						borderRadius: 4,
					}}
				/>
			</View>
		</View>
	);
}

function OfferRowView({
	title,
	icon,
	onSeeAll,
	offers,
	isLoading,
	isError,
}: {
	title: string;
	icon?: React.ReactNode;
	onSeeAll?: () => void;
	offers?: OfferDetail[];
	isLoading: boolean;
	isError: boolean;
}) {
	const { colors } = useTheme();

	if (!isLoading && !isError && offers && offers.length === 0) return null;

	return (
		<View style={styles.container}>
			<SectionHeader title={title} icon={icon} onSeeAll={onSeeAll} />
			{isLoading ? (
				<FlatList
					data={Array.from({ length: 3 })}
					keyExtractor={(_, i) => `skeleton-${i}`}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowContent}
					renderItem={() => <OfferSkeleton />}
				/>
			) : isError ? (
				<AppText
					variant="bodyMedium"
					style={{ color: colors.mutedForeground, paddingHorizontal: spacing.xl }}
				>
					{strings.home.noOffers}
				</AppText>
			) : (
				<FlatList
					data={offers}
					keyExtractor={(item) => item.offer.id}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowContent}
					renderItem={({ item }) => (
						<View style={{ width: 260, height: ROW_CARD_HEIGHT }}>
							<OfferCard offer={item} />
						</View>
					)}
				/>
			)}
		</View>
	);
}

export function OfferRowSection({
	type,
	title,
	icon,
	limit = 10,
	category = null,
	onSeeAll,
}: OfferRowSectionProps) {
	switch (type) {
		case "popular": {
			const q = usePopularOffers(limit, category);
			return (
				<OfferRowView
					title={title}
					icon={icon}
					onSeeAll={onSeeAll}
					offers={q.data}
					isLoading={q.isLoading}
					isError={q.isError}
				/>
			);
		}
		case "expiring": {
			const q = useExpiringSoonOffers(limit);
			return (
				<OfferRowView
					title={title}
					icon={icon}
					onSeeAll={onSeeAll}
					offers={q.data}
					isLoading={q.isLoading}
					isError={q.isError}
				/>
			);
		}
		case "recent": {
			const q = useRecentOffers(limit);
			return (
				<OfferRowView
					title={title}
					icon={icon}
					onSeeAll={onSeeAll}
					offers={q.data}
					isLoading={q.isLoading}
					isError={q.isError}
				/>
			);
		}
		case "nearby": {
			const q = useNearbyOffersHook(limit, category);
			return (
				<OfferRowView
					title={title}
					icon={icon}
					onSeeAll={onSeeAll}
					offers={q.data}
					isLoading={q.isLoading}
					isError={q.isError}
				/>
			);
		}
	}
}

export function OfferColumnSection({
	title,
	limit = 10,
	category = null,
	onSeeAll,
}: {
	title: string;
	limit?: number;
	category?: string | null;
	onSeeAll?: () => void;
}) {
	const { colors } = useTheme();
	const selectedAddress = useSelectedAddress();
	const { data: offers, isLoading, isError } = useNearbyOffersHook(limit, category);

	const hasLocation =
		selectedAddress?.latitude != null && selectedAddress?.longitude != null;

	if (!hasLocation) {
		return (
			<View style={styles.locationPromptWrap}>
				<Card style={styles.locationPromptCard}>
					<View style={styles.locationPromptRow}>
						<View
							style={[
								styles.locationPromptIcon,
								{ backgroundColor: colors.primary + "14" },
							]}
						>
							<Ionicons
								name="location-outline"
								size={20}
								color={colors.primary}
							/>
						</View>
						<View style={styles.locationPromptText}>
							<AppText variant="bodyMedium" weight="semiBold">
								{strings.home.activateLocation}
							</AppText>
							<AppText
								variant="bodySmall"
								style={{ color: colors.mutedForeground }}
							>
								{strings.home.activateLocationBody}
							</AppText>
						</View>
					</View>
				</Card>
			</View>
		);
	}

	if (!isLoading && !isError && offers && offers.length === 0) return null;

	return (
		<View style={styles.container}>
			<SectionHeader title={title} onSeeAll={onSeeAll} />
			{isLoading ? (
				<View style={styles.columnContent}>
					{Array.from({ length: 3 }).map((_, i) => (
						<View key={`skeleton-${i}`} style={styles.columnItem}>
							<OfferSkeleton fullWidth />
						</View>
					))}
				</View>
			) : isError ? (
				<AppText
					variant="bodyMedium"
					style={{ color: colors.mutedForeground, paddingHorizontal: spacing.xl }}
				>
					{strings.home.noOffers}
				</AppText>
			) : (
				<View style={styles.columnContent}>
					{offers?.map((item) => (
						<View key={item.offer.id} style={styles.columnItem}>
							<OfferCard offer={item} />
						</View>
					))}
				</View>
			)}
		</View>
	);
}

const ROW_CARD_HEIGHT = 270;

const styles = StyleSheet.create({
	container: {
		marginBottom: spacing.lg,
	},
	rowContent: {
		paddingHorizontal: spacing.lg,
		gap: spacing.md,
	},
	offerCard: {
		padding: 0,
		overflow: "hidden",
		borderRadius: radii.xl,
		borderWidth: 0,
		flex: 1,
	},
	offerFull: {
		width: "100%",
	},
	offerCardSkeleton: {
		width: 260,
		height: ROW_CARD_HEIGHT,
		borderRadius: radii.xl,
		overflow: "hidden",
		borderWidth: 1,
	},	offerImageWrap: {
		width: "100%",
		height: 160,
	},
	offerImage: {
		width: "100%",
		height: 160,
	},
	offerImagePlaceholder: {
		backgroundColor: "#E5E5E5",
	},
	discountBadge: {
		position: "absolute",
		top: spacing.sm,
		right: spacing.sm,
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: radii.pill,
	},
	lowStockBadge: {
		position: "absolute",
		bottom: spacing.sm,
		left: spacing.sm,
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.pill,
	},
	heartButton: {
		position: "absolute",
		top: spacing.sm,
		left: spacing.sm,
	},
	heartCircle: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.12,
		shadowRadius: 6,
		elevation: 2,
	},
	offerBody: {
		padding: spacing.md,
	},
	offerBodyRow: {
		flexDirection: "row",
		alignItems: "flex-end",
	},
	offerInfo: {
		flex: 4,
		paddingRight: spacing.sm,
	},
	offerPrice: {
		flex: 2,
		alignItems: "flex-end",
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		marginTop: 6,
	},
	columnContent: {
		paddingHorizontal: spacing.lg,
	},
	columnItem: {
		marginBottom: spacing.md,
	},
	locationPromptWrap: {
		padding: spacing.lg,
	},
	locationPromptCard: {
		padding: spacing.md,
		borderRadius: radii.lg,
	},
	locationPromptRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
	},
	locationPromptIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		alignItems: "center",
		justifyContent: "center",
	},
	locationPromptText: {
		flex: 1,
	},
});
