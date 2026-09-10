import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Skeleton } from "@/components/ui/skeleton";
import { AppText, Card } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { withAlpha } from "@/core/theme/alpha";
import { formatDistanceKm } from "@/core/utils/formatters";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import type { BusinessSummary } from "@/features/offers/domain/offer";
import { haversineKm } from "@/features/offers/domain/offer";
import { useSelectedAddress } from "@/features/hooks";

interface BusinessGridCardProps {
	business: BusinessSummary;
	/** Override de ubicación; si se omite se usa la dirección seleccionada. */
	userLat?: number;
	userLng?: number;
	style?: StyleProp<ViewStyle>;
	onPress?: () => void;
}

export function BusinessGridCard({
	business,
	userLat,
	userLng,
	style,
	onPress,
}: BusinessGridCardProps) {
	const { colors } = useTheme();
	const selectedAddress = useSelectedAddress();

	const lat = userLat ?? selectedAddress?.latitude;
	const lng = userLng ?? selectedAddress?.longitude;
	const distance =
		lat != null &&
		lng != null &&
		business.latitude != null &&
		business.longitude != null
			? formatDistanceKm(haversineKm(lat, lng, business.latitude, business.longitude))
			: "";

	const typeLabel = BUSINESS_TYPE_LABELS[business.type] ?? business.type;

	return (
		<Card
			style={[styles.card, style]}
			onPress={onPress ?? (() => router.push(`/business-profile/${business.id}`))}
		>
			<View style={styles.imageWrap}>
				{business.imageUrl ? (
					<Image
						source={{ uri: business.imageUrl }}
						style={styles.image}
						contentFit="cover"
					/>
				) : (
					<View style={[styles.image, styles.imagePlaceholder, { backgroundColor: colors.muted }]}>
						<Ionicons name="storefront-outline" size={28} color={colors.mutedForeground} />
					</View>
				)}
				{business.rating > 0 ? (
					<View
						style={[
							styles.ratingBadge,
							{ backgroundColor: withAlpha(colors.card, 0.922), boxShadow: `0px 1px 4px ${colors.shadow}` },
						]}
					>
						<Ionicons name="star" size={14} color={colors.green} />
						<AppText style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>
							{business.rating.toFixed(1)}
						</AppText>
					</View>
				) : null}
				{distance ? (
					<View
						style={[
							styles.distanceBadge,
							{ backgroundColor: withAlpha(colors.card, 0.922), boxShadow: `0px 1px 4px ${colors.shadow}` },
						]}
					>
						<Ionicons
							name="location-outline"
							size={12}
							color={colors.mutedForeground}
						/>
						<AppText
							style={{
								fontSize: 12,
								fontWeight: "600",
								color: colors.foreground,
							}}
						>
							{distance}
						</AppText>
					</View>
				) : null}
			</View>
			<View style={styles.info}>
				<AppText
					variant="h4"
					weight="bold"
					numberOfLines={2}
					style={{ fontSize: 16, letterSpacing: -0.3, height: 40 }}
				>
					{business.name}
				</AppText>
				<AppText
					style={{
						color: colors.mutedForeground,
						fontSize: 12,
						fontWeight: "500",
						letterSpacing: 0.5,
						marginTop: 4,
						textTransform: "uppercase",
					}}
					numberOfLines={1}
				>
					{typeLabel}
				</AppText>
			</View>
		</Card>
	);
}

export function BusinessGridCardSkeleton({ style }: { style?: StyleProp<ViewStyle> }) {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.skeleton,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
				style,
			]}
		>
			<Skeleton style={styles.image} />
			<View style={styles.info}>
				<Skeleton
					style={{
						height: 16,
						width: "85%",
						borderRadius: 4,
					}}
				/>
				<Skeleton
					style={{
						height: 10,
						width: "55%",
						borderRadius: 4,
						marginTop: 8,
					}}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		padding: 0,
		overflow: "hidden",
		borderRadius: radii.sm,
		borderWidth: 0,
		flex: 1,
	},
	skeleton: {
		borderRadius: radii.sm,
		overflow: "hidden",
		borderWidth: 1,
		flex: 1,
	},
	imageWrap: {
		width: "100%",
		height: 140,
	},
	image: {
		width: "100%",
		height: 140,
	},
	imagePlaceholder: {
		alignItems: "center",
		justifyContent: "center",
	},
	ratingBadge: {
		position: "absolute",
		top: spacing.sm,
		left: spacing.sm,
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingHorizontal: spacing.sm,
		paddingVertical: 4,
		borderRadius: radii.sm,
	},
	distanceBadge: {
		position: "absolute",
		bottom: spacing.sm,
		left: spacing.sm,
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingHorizontal: spacing.sm,
		paddingVertical: 4,
		borderRadius: radii.sm,
	},
	info: {
		padding: 10,
		height: 90,
		justifyContent: "flex-start",
	},
});
