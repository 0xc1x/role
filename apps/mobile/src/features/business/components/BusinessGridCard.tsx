import { Image, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { formatDistanceKm } from "@/core/utils/formatters";
import { BUSINESS_TYPE_LABELS } from "@/features/business/domain/business";
import type { BusinessSummary } from "@/features/offers/domain/offer";

export function BusinessGridCard({
	business,
	userLat,
	userLng,
}: {
	business: BusinessSummary;
	userLat?: number;
	userLng?: number;
}) {
	const { colors } = useTheme();

	const distance =
		userLat != null &&
		userLng != null &&
		business.latitude != null &&
		business.longitude != null
			? formatDistanceKm(
					haversine(
						userLat,
						userLng,
						business.latitude,
						business.longitude,
					),
				)
			: "";

	const typeLabel = BUSINESS_TYPE_LABELS[business.type] ?? business.type;

	return (
		<Pressable
			onPress={() => router.push(`/business-profile/${business.id}`)}
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
					shadowColor: colors.cardShadow,
				},
			]}
		>
			<View style={styles.imageWrap}>
				{business.imageUrl ? (
					<Image
						source={{ uri: business.imageUrl }}
						style={styles.image}
						resizeMode="cover"
					/>
				) : (
					<View style={[styles.image, styles.imagePlaceholder]}>
						<Ionicons name="storefront-outline" size={28} color={colors.mutedForeground} />
					</View>
				)}
				{business.rating > 0 ? (
					<View style={[styles.ratingBadge, { backgroundColor: colors.card }]}>
						<Ionicons name="star" size={12} color={colors.starGold} />
						<AppText style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>
							{business.rating.toFixed(1)}
						</AppText>
					</View>
				) : null}
				{distance ? (
					<View style={[styles.distanceBadge, { backgroundColor: colors.card }]}>
						<Ionicons name="location-outline" size={11} color={colors.mutedForeground} />
						<AppText style={{ fontSize: 11, fontWeight: "600", color: colors.mutedForeground }}>
							{distance}
						</AppText>
					</View>
				) : null}
			</View>
			<View style={styles.body}>
				<AppText variant="h4" weight="bold" numberOfLines={1} style={{ fontSize: 14 }}>
					{business.name}
				</AppText>
				<AppText
					numberOfLines={1}
					style={{
						color: colors.mutedForeground,
						fontSize: 11,
						fontWeight: "500",
					}}
				>
					{typeLabel.toUpperCase()}
				</AppText>
			</View>
		</Pressable>
	);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return 6371 * c;
}

const styles = StyleSheet.create({
	card: {
		borderRadius: radii.lg,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 1,
		shadowRadius: 16,
		elevation: 2,
	},
	imageWrap: {
		height: 140,
	},
	image: {
		width: "100%",
		height: "100%",
	},
	imagePlaceholder: {
		backgroundColor: "#E5E5E5",
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
	body: {
		padding: spacing.md,
		gap: 4,
	},
});