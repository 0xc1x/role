import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import {
	Clock,
	Ellipsis,
	Eye,
	EyeOff,
	Package,
	Pencil,
	Store,
	Trash2,
	TrendingUp,
	type LucideIcon,
} from "lucide-react-native";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CardPressable } from "@/components/ui/card-presable";

import { strings } from "@/src/core/i18n/strings";
import { AppText, BottomSheetModal, StatusBadge } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import { formatMoney, formatRelativeDay } from "@/src/core/utils/formatters";
import type { OfferDetail } from "@/src/features/offers/domain/offer";
import { useDeleteOffer, useToggleOfferActive } from "@/src/features/business/hooks";

/**
 * Business product card (Rolé v1 port): badges and title on top, pickup
 * window and stock chips below, prices, and the actions
 * Ver detalles / Editar / Más acciones in a bordered footer.
 */
export function ProductCard({
	businessId,
	product,
}: {
	businessId: string;
	product: OfferDetail;
}) {
	const { colors } = useTheme();
	const [menuOpen, setMenuOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const deleteOffer = useDeleteOffer(businessId);
	const toggleActive = useToggleOfferActive(businessId);

	const isActive = product.offer.is_active;
	const sold = Math.max(
		0,
		(product.offer.initial_stock ?? product.offer.stock) - product.offer.stock,
	);

	const openDetail = () =>
		router.push(`/business/${businessId}/offer/${product.offer.id}`);

	return (
		<>
			<View style={[styles.card, { backgroundColor: colors.card }]}>
				<CardPressable
					className="p-0 gap-0 border-0 shadow-none"
					style={[
						styles.cardBody,
						{
							backgroundColor: colors.card,
							borderColor: colors.borderSolid,
						},
					]}
					onPress={openDetail}
				>
				<View style={styles.mainRow}>
					{/* Full-bleed image; badges remain in the information column. */}
					<View style={styles.imageWrap}>
						{product.offer.image ? (
							<Image
								source={{ uri: product.offer.image }}
								style={styles.image}
								contentFit="cover"
							/>
						) : (
							<View
								style={[styles.image, styles.imagePlaceholder, { backgroundColor: colors.borderSolid }]}
							>
								<Package size={28} color={colors.mutedForeground} />
							</View>
						)}
						{!isActive ? (
							<View style={[styles.imageOverlay, { backgroundColor: withAlpha(colors.scrim, 0.56) }]}>
								<EyeOff size={20} color={colors.onMedia} />
							</View>
						) : null}
					</View>

					<View style={styles.info}>
						<View style={styles.statusRow}>
							<StatusBadge
								label={isActive ? strings.business.active : strings.business.inactive}
								tone={isActive ? "success" : "neutral"}
							/>
							{sold > 0 ? (
								<View style={[styles.soldChip, { backgroundColor: colors.surfaceSuccess }]}>
									<TrendingUp size={12} color={colors.success} />
									<AppText
										variant="bodySmall"
										weight="semiBold"
										style={[styles.chipText, { color: colors.success }]}
									>
										{strings.business.soldCount.replace("{n}", String(sold))}
									</AppText>
								</View>
							) : null}
						</View>
						<AppText variant="h4" weight="bold" numberOfLines={2}>
							{product.offer.title}
						</AppText>

						{product.location?.name ? (
							<View style={[styles.infoChip, { backgroundColor: withAlpha(colors.scrim, 0.04) }]}>
								<Store
									size={12}
									color={colors.mutedForeground}
								/>
								<AppText
									variant="bodySmall"
									numberOfLines={1}
									style={[styles.chipText, { color: colors.mutedForeground }]}
								>
									{product.location.name}
								</AppText>
							</View>
						) : null}
						<View style={styles.infoChips}>
							<View style={[styles.infoChip, { backgroundColor: withAlpha(colors.scrim, 0.04) }]}>
								<Clock size={12} color={colors.mutedForeground} />
								<AppText variant="bodySmall" style={[styles.chipText, { color: colors.mutedForeground }]}>
									{strings.business.untilTime.replace(
										"{time}",
										formatRelativeDay(product.offer.pickup_end),
									)}
								</AppText>
							</View>
							<View style={[styles.infoChip, { backgroundColor: withAlpha(colors.scrim, 0.04) }]}>
								<Package
									size={12}
									color={colors.mutedForeground}
								/>
								<AppText variant="bodySmall" style={[styles.chipText, { color: colors.mutedForeground }]}>
									{product.offer.stock}
								</AppText>
							</View>
						</View>

						<View style={styles.priceRow}>
							<AppText variant="priceLarge" style={{ color: colors.primary }}>
								{formatMoney(product.offer.discounted_price)}
							</AppText>
							<AppText
								variant="priceOriginal"
								style={[styles.original, { color: colors.mutedForeground }]}
							>
								{formatMoney(product.offer.original_price)}
							</AppText>
						</View>
					</View>
				</View>
				</CardPressable>

				<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />
				<View style={styles.actions}>
					<ActionButton icon={Eye} label={strings.business.viewDetails} onPress={openDetail} />
					<ActionButton
						icon={Pencil}
						label={strings.common.edit}
						onPress={() =>
							router.push(`/business/${businessId}/offer/${product.offer.id}/edit`)
						}
					/>
					<ActionButton
						icon={Ellipsis}
						label={strings.business.moreActions}
						onPress={() => setMenuOpen(true)}
					/>
				</View>
			</View>

			{menuOpen ? (
				<BottomSheetModal
					title={product.offer.title}
					onClose={() => setMenuOpen(false)}
				>
					<View style={styles.menuList}>
						<MenuRow
							icon={isActive ? EyeOff : Eye}
							label={isActive ? strings.business.deactivate : strings.business.activate}
							onPress={() => {
								toggleActive.mutate({ offerId: product.offer.id, isActive: !isActive });
								setMenuOpen(false);
							}}
						/>
						<MenuRow
							icon={Pencil}
							label={strings.common.edit}
							onPress={() => {
								setMenuOpen(false);
								router.push(`/business/${businessId}/offer/${product.offer.id}/edit`);
							}}
						/>
						<MenuRow
							icon={Trash2}
							label={strings.common.delete}
							destructive
							onPress={() => {
								setMenuOpen(false);
								setDeleteOpen(true);
							}}
						/>
					</View>
				</BottomSheetModal>
			) : null}

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
							onPress={() => deleteOffer.mutate(product.offer.id)}
						>
							<Text>{strings.common.delete}</Text>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}

/** Skeleton mirrors the proportional image, information and action rows. */
export function ProductCardSkeleton() {
	const { colors } = useTheme();
	return (
		<View
			accessible
			accessibilityLabel={strings.common.loading}
			accessibilityState={{ busy: true }}
			testID="product-card-skeleton"
			style={[
				styles.card,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
				},
			]}
		>
			<View style={styles.mainRow}>
				<Skeleton style={[styles.imageWrap, styles.skeletonImage]} />
				<View style={styles.info}>
					<View style={styles.statusRow}>
						<Skeleton style={styles.skeletonBadge} />
						<Skeleton style={styles.skeletonSoldBadge} />
					</View>
					<View>
						<Skeleton style={styles.skeletonTitle} />
						<Skeleton style={[styles.skeletonTitle, { width: "70%" }]} />
					</View>
					<Skeleton style={styles.skeletonBranch} />
					<View style={styles.infoChips}>
						<Skeleton style={styles.skeletonDate} />
						<Skeleton style={styles.skeletonStock} />
					</View>
					<View style={styles.priceRow}>
						<Skeleton style={styles.skeletonPrice} />
						<Skeleton style={styles.skeletonOriginalPrice} />
					</View>
				</View>
			</View>
			<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />
			<View style={styles.actions}>
				{[0, 1, 2].map((i) => (
					<Skeleton key={`product-action-skeleton-${i}`} style={styles.skeletonAction} />
				))}
			</View>
		</View>
	);
}

function ActionButton({
	icon: Icon,
	label,
	onPress,
}: {
	icon: LucideIcon;
	label: string;
	onPress?: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Button
			variant="ghost"
			size="sm"
			style={styles.action}
			onPress={onPress}
			icon={<Icon size={14} color={colors.foreground} />}
		>
			<AppText variant="bodySmall" weight="semiBold" style={[styles.chipText, { color: colors.foreground }]}>
				{label}
			</AppText>
		</Button>
	);
}

function MenuRow({
	icon: Icon,
	label,
	destructive,
	onPress,
}: {
	icon: LucideIcon;
	label: string;
	destructive?: boolean;
	onPress?: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			cssInterop={false}
			onPress={onPress}
			style={({ pressed }) => [
				styles.menuRow,
				{
					backgroundColor: colors.inputBackground,
					borderColor: colors.borderSolid,
					opacity: pressed ? 0.85 : 1,
				},
			]}
		>
			<Icon
				size={18}
				color={destructive ? colors.destructive : colors.foreground}
			/>
			<AppText
				variant="bodyMedium"
				weight="medium"
				style={{ color: destructive ? colors.destructive : colors.foreground }}
			>
				{label}
			</AppText>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		borderRadius: radii.xl,
		overflow: "hidden",
	},
	cardBody: {
		borderBottomLeftRadius: 0,
		borderBottomRightRadius: 0,
	},
	mainRow: {
		flexDirection: "row",
		minHeight: 165,
	},
	// Stretch with the content; the card clips the full-bleed image corners.
	imageWrap: {
		width: "35%",
		position: "relative",
		overflow: "hidden",
	},
	image: {
		...StyleSheet.absoluteFill,
	},
	imagePlaceholder: {
		alignItems: "center",
		justifyContent: "center",
	},
	imageOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	info: {
		flex: 1,
		minWidth: 0,
		gap: spacing.xs,
		padding: spacing.md,
	},
	statusRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		gap: spacing.xs,
	},
	soldChip: {
		maxWidth: "100%",
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: radii.pill,
	},
	infoChips: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	infoChip: {
		alignSelf: "flex-start",
		maxWidth: "100%",
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: radii.sm,
	},
	chipText: {
		flexShrink: 1,
	},
	priceRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "baseline",
		gap: spacing.sm,
		marginTop: "auto",
	},
	original: {
		textDecorationLine: "line-through",
		fontSize: 12,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
	},
	actions: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.xs,
		paddingHorizontal: spacing.sm,
		paddingVertical: spacing.xs,
	},
	action: {
		height: "auto",
		minHeight: 44,
		maxWidth: "100%",
		paddingHorizontal: spacing.xs,
		paddingVertical: spacing.sm,
		gap: spacing.xs,
	},
	menuList: {
		gap: 8,
	},
	menuRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
		borderRadius: radii.lg,
		borderWidth: 1,
	},
	skeletonImage: {
		borderRadius: 0,
	},
	skeletonBadge: {
		height: 22,
		width: "40%",
		borderRadius: radii.pill,
	},
	skeletonSoldBadge: {
		height: 20,
		width: "55%",
		borderRadius: radii.pill,
	},
	skeletonTitle: {
		height: 17,
		marginVertical: 2,
		width: "90%",
		borderRadius: radii.sm,
	},
	skeletonBranch: {
		height: 20,
		width: "75%",
		borderRadius: radii.sm,
	},
	skeletonDate: {
		height: 20,
		width: "65%",
		borderRadius: radii.sm,
	},
	skeletonStock: {
		height: 20,
		width: "25%",
		borderRadius: radii.sm,
	},
	skeletonPrice: {
		height: 29,
		width: "40%",
		borderRadius: radii.sm,
	},
	skeletonOriginalPrice: {
		height: 16,
		width: "30%",
		borderRadius: radii.sm,
	},
	skeletonAction: {
		minHeight: 44,
		flex: 1,
		borderRadius: radii.sm,
	},
});