import { useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Text } from "@/components/ui/text";

import { strings } from "@/core/i18n/strings";
import { AppText, Button, Card, Screen, ScreenHeader, StatusBadge } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import {
	formatDateTime,
	formatMoney,
	formatTime,
} from "@/core/utils/formatters";
import { categoryLabel, type OfferDetail } from "@/features/offers/domain/offer";
import { useDeleteOffer, useToggleOfferActive } from "@/features/business/hooks";

/**
 * Product detail + performance stats (ported from Rolé v1
 * `BusinessProductDetailScreen`).
 */
export function ProductDetail({
	businessId,
	product,
}: {
	businessId: string;
	product: OfferDetail;
}) {
	const { colors } = useTheme();
	const [deleteOpen, setDeleteOpen] = useState(false);
	const deleteOffer = useDeleteOffer(businessId);
	const toggleActive = useToggleOfferActive(businessId);

	const offer = product.offer;
	const isActive = offer.is_active;
	const sold = Math.max(0, (offer.initial_stock ?? offer.stock) - offer.stock);
	const revenue = sold * offer.discounted_price;
	const discount =
		offer.original_price > 0
			? Math.round(
					((offer.original_price - offer.discounted_price) /
						offer.original_price) *
						100,
				)
			: 0;
	const categories = categoryLabel(product.categories);

	return (
		<Screen scroll>
			<View style={styles.content}>
				<ScreenHeader title={strings.business.productDetailTitle} />
				<View style={styles.headerRow}>
					<AppText variant="h2" weight="bold" style={{ flex: 1 }} numberOfLines={1}>
						{offer.title}
					</AppText>
					<StatusBadge
						label={isActive ? strings.business.active : strings.business.inactive}
						tone={isActive ? "success" : "neutral"}
					/>
				</View>

				<View style={styles.hero}>
					{offer.image ? (
						<Image source={{ uri: offer.image }} style={styles.heroImage} />
					) : (
						<View style={[styles.heroImage, styles.heroPlaceholder]}>
							<Ionicons name="cube-outline" size={40} color={colors.mutedForeground} />
						</View>
					)}
					{!isActive ? (
						<View style={[styles.inactiveOverlay, { backgroundColor: "rgba(0,0,0,0.56)" }]}>
							<AppText variant="bodyMedium" weight="bold" color="#FFFFFF">
								{strings.business.inactive}
							</AppText>
						</View>
					) : null}
					{discount > 0 ? (
						<View style={[styles.discountBadge, { backgroundColor: colors.primary }]}>
							<AppText
								weight="bold"
								color="#FFFFFF"
								style={{ fontSize: 13 }}
							>
								-{discount}% OFF
							</AppText>
						</View>
					) : null}
				</View>

				<View style={styles.statsRow}>
					<StatCard
						label={strings.business.unitsSold}
						value={String(sold)}
						icon="bag-handle-outline"
						color={colors.success}
						bg={colors.surfaceSuccess}
					/>
					<StatCard
						label={strings.business.revenue}
						value={formatMoney(revenue)}
						icon="cash-outline"
						color={colors.primary}
						bg={colors.destructiveSurface}
					/>
					<StatCard
						label={strings.business.created}
						value={String(offer.initial_stock ?? offer.stock)}
						icon="cube-outline"
						color={colors.warning}
						bg={colors.surfaceWarning}
					/>
				</View>

				<View style={styles.quickActions}>
					<Button
						label={strings.common.edit}
						icon={<Ionicons name="create-outline" size={18} color="#FFFFFF" />}
						style={{ flex: 1 }}
						onPress={() =>
							router.push(`/business/${businessId}/offer/${offer.id}/edit`)
						}
					/>
					<Button
						label={isActive ? strings.business.deactivate : strings.business.activate}
						variant="outline"
						style={{ flex: 1 }}
						onPress={() =>
							toggleActive.mutate({ offerId: offer.id, isActive: !isActive })
						}
					/>
					<Button
						label=""
						variant="ghost"
						icon={<Ionicons name="trash-outline" size={20} color={colors.destructive} />}
						onPress={() => setDeleteOpen(true)}
						accessibilityLabel={strings.common.delete}
					/>
				</View>

				<Card style={styles.card}>
					{offer.description ? (
						<AppText variant="bodyMedium">{offer.description}</AppText>
					) : null}
					<View style={styles.priceRow}>
						<AppText variant="priceLarge" style={{ color: colors.primary }}>
							{formatMoney(offer.discounted_price)}
						</AppText>
						<AppText
							variant="priceOriginal"
							style={{ color: colors.mutedForeground, textDecorationLine: "line-through" }}
						>
							{formatMoney(offer.original_price)}
						</AppText>
					</View>
					<View style={styles.grid}>
						<InfoField label={strings.business.productStock} value={String(offer.stock)} />
						<InfoField label={strings.business.availableUntil} value={formatDateTime(offer.pickup_end)} />
						<InfoField label={strings.business.soldToday} value={String(sold)} />
						<InfoField
							label={strings.business.status}
							value={isActive ? strings.business.active : strings.business.inactive}
						/>
						<InfoField
							label={strings.business.pickupFrom}
							value={formatTime(offer.pickup_start)}
						/>
						<InfoField label={strings.business.category} value={categories || "—"} />
					</View>
				</Card>

				{offer.includes ? (
					<Card style={styles.card}>
						<AppText variant="h4" weight="bold">
							{strings.business.includesTitle}
						</AppText>
						{splitList(offer.includes).map((item) => (
							<View key={item} style={styles.listRow}>
								<Ionicons name="checkmark-circle" size={18} color={colors.success} />
								<AppText variant="bodyMedium" style={{ flex: 1 }}>
									{item}
								</AppText>
							</View>
						))}
					</Card>
				) : null}

				{offer.allergens ? (
					<Card style={styles.card}>
						<AppText variant="h4" weight="bold">
							{strings.business.allergensTitle}
						</AppText>
						<View style={[styles.allergenRow, { backgroundColor: colors.surfaceWarning }]}>
							{splitList(offer.allergens).map((item) => (
								<View
									key={item}
									style={[styles.allergenChip, { backgroundColor: colors.warning }]}
								>
									<AppText variant="bodySmall" weight="semiBold" color="#FFFFFF">
										{item}
									</AppText>
								</View>
							))}
						</View>
					</Card>
				) : null}
			</View>

			<AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{strings.business.deleteProductTitle}</AlertDialogTitle>
						<AlertDialogDescription>
							{strings.business.deleteProductBody}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{strings.common.cancel}</Text>
						</AlertDialogCancel>
						<AlertDialogAction
							onPress={() => {
								setDeleteOpen(false);
								deleteOffer.mutate(offer.id, { onSuccess: () => router.back() });
							}}
						>
							<Text>{strings.common.delete}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Screen>
	);
}

function splitList(value: string): string[] {
	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function StatCard({
	label,
	value,
	icon,
	color,
	bg,
}: {
	label: string;
	value: string;
	icon: keyof typeof Ionicons.glyphMap;
	color: string;
	bg: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.borderSolid }]}>
			<View style={[styles.statIcon, { backgroundColor: bg }]}>
				<Ionicons name={icon} size={16} color={color} />
			</View>
			<AppText variant="h3" weight="extraBold" numberOfLines={1} style={{ color }}>
				{value}
			</AppText>
			<AppText variant="bodySmall" numberOfLines={1} style={{ color: colors.mutedForeground }}>
				{label}
			</AppText>
		</View>
	);
}

function InfoField({ label, value }: { label: string; value: string }) {
	const { colors } = useTheme();
	return (
		<View style={styles.gridItem}>
			<AppText variant="labelSmall" style={{ color: colors.mutedForeground }}>
				{label}
			</AppText>
			<AppText variant="bodyMedium" weight="semiBold" numberOfLines={2}>
				{value}
			</AppText>
		</View>
	);
}

const styles = StyleSheet.create({
	content: {
		padding: spacing.xl,
		gap: spacing.lg,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	hero: {
		height: 220,
		borderRadius: radii.lg,
		overflow: "hidden",
	},
	heroImage: {
		width: "100%",
		height: "100%",
	},
	heroPlaceholder: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#E5E5E5",
	},
	inactiveOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	discountBadge: {
		position: "absolute",
		right: spacing.md,
		bottom: spacing.md,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.xs + 2,
		borderRadius: radii.md,
	},
	statsRow: {
		flexDirection: "row",
		gap: spacing.sm,
	},
	statCard: {
		flex: 1,
		alignItems: "center",
		paddingVertical: spacing.lg,
		paddingHorizontal: spacing.sm,
		borderRadius: radii.lg,
		borderWidth: 1,
		gap: 2,
	},
	statIcon: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: spacing.xs,
	},
	quickActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	card: {
		padding: spacing.lg,
		gap: spacing.md,
	},
	priceRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: spacing.sm,
	},
	grid: {
		flexDirection: "row",
		flexWrap: "wrap",
		rowGap: spacing.lg,
	},
	gridItem: {
		width: "50%",
		paddingRight: spacing.md,
		gap: 2,
	},
	listRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	allergenRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
		padding: spacing.sm,
		borderRadius: radii.md,
	},
	allergenChip: {
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.xs + 2,
		borderRadius: radii.pill,
	},
});