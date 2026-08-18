import { View, StyleSheet, FlatList, Image, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useTheme } from "@/core/theme";
import { AppText, Card, SectionHeader } from "@/core/ui";
import { spacing, radii } from "@/core/theme/spacing";
import { useNearbyBusinesses, useSelectedAddress } from "@/features/hooks";
import { formatDistanceKm } from "@/core/utils/formatters";
import { haversineKm, type BusinessSummary } from "@/features/offers/domain/offer";

interface BusinessCardProps {
	business: BusinessSummary;
}

function BusinessCard({ business }: BusinessCardProps) {
	const { colors } = useTheme();
	const selectedAddress = useSelectedAddress();

	const distance =
		selectedAddress?.latitude != null &&
		selectedAddress?.longitude != null &&
		business.latitude != null &&
		business.longitude != null
			? formatDistanceKm(
					haversineKm(
						selectedAddress.latitude,
						selectedAddress.longitude,
						business.latitude,
						business.longitude,
					),
				)
			: "";

	return (
		<Card
			style={styles.businessCard}
			onPress={() => router.push(`/business-profile/${business.id}`)}
		>
			<View style={styles.businessImageWrap}>
				{business.imageUrl ? (
					<Image
						source={{ uri: business.imageUrl }}
						style={styles.businessImage}
						resizeMode="cover"
					/>
				) : (
					<View style={[styles.businessImage, { backgroundColor: colors.muted }]} />
				)}
				{business.rating > 0 && (
					<View
						style={[
							styles.ratingBadge,
							{ backgroundColor: colors.card + "EB" },
						]}
					>
						<Ionicons name="star" size={14} color={colors.green} />
						<AppText
							style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}
						>
							{business.rating.toFixed(1)}
						</AppText>
					</View>
				)}
				{distance ? (
					<View
						style={[
							styles.distanceBadge,
							{ backgroundColor: colors.card + "EB" },
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
			<View style={styles.businessInfo}>
				<AppText
					variant="h4"
					weight="bold"
					numberOfLines={1}
					style={{ fontSize: 16, letterSpacing: -0.3 }}
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
					{business.type}
				</AppText>
			</View>
		</Card>
	);
}

function BusinessSkeleton() {
	const { colors } = useTheme();
	return (
		<View
			style={[
				styles.businessCardSkeleton,
				{ backgroundColor: colors.card, borderColor: colors.borderSolid },
			]}
		>
			<View style={[styles.businessImage, { backgroundColor: colors.muted }]} />
			<View style={styles.businessInfo}>
				<View
					style={{
						height: 16,
						width: "85%",
						backgroundColor: colors.muted,
						borderRadius: 4,
					}}
				/>
				<View
					style={{
						height: 10,
						width: "55%",
						backgroundColor: colors.muted,
						borderRadius: 4,
						marginTop: 8,
					}}
				/>
			</View>
		</View>
	);
}

export function BusinessRowSection({
	limit = 5,
	onSeeAll,
}: {
	limit?: number;
	onSeeAll?: () => void;
}) {
	const { colors } = useTheme();
	const { data: businesses, isLoading, isError } = useNearbyBusinesses(limit);

	return (
		<View style={styles.container}>
			<SectionHeader
				title="Negocios Cerca"
				icon={<Ionicons name="storefront-outline" size={18} color={colors.primary} />}
				onSeeAll={onSeeAll}
			/>
			{isLoading ? (
				<FlatList
					data={Array.from({ length: 3 })}
					keyExtractor={(_, i) => `skeleton-${i}`}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowContent}
					renderItem={() => <BusinessSkeleton />}
				/>
			) : isError ? (
				<AppText
					variant="bodyMedium"
					style={{ color: colors.mutedForeground, paddingHorizontal: spacing.xl }}
				>
					Error al cargar negocios
				</AppText>
			) : businesses && businesses.length > 0 ? (
				<FlatList
					data={businesses}
					keyExtractor={(item) => item.id}
					horizontal
					showsHorizontalScrollIndicator={false}
					contentContainerStyle={styles.rowContent}
					renderItem={({ item }) => (
						<View style={{ width: 140, height: 210 }}>
							<BusinessCard business={item} />
						</View>
					)}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		marginBottom: spacing.lg,
	},
	rowContent: {
		paddingHorizontal: spacing.lg,
		gap: spacing.md,
	},
	businessCard: {
		padding: 0,
		overflow: "hidden",
		borderRadius: radii.sm,
		borderWidth: 0,
		flex: 1,
	},
	businessCardSkeleton: {
		width: 140,
		height: 210,
		borderRadius: radii.sm,
		overflow: "hidden",
		borderWidth: 1,
	},
	businessImageWrap: {
		width: "100%",
		height: 140,
	},
	businessImage: {
		width: "100%",
		height: 140,
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
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 4,
		elevation: 1,
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
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.08,
		shadowRadius: 4,
		elevation: 1,
	},
	businessInfo: {
		padding: 12,
	},
});
