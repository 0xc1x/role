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
import { AppText, BottomSheetModal, StatusBadge } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import { formatMoney, formatTime } from "@/core/utils/formatters";
import type { OfferDetail } from "@/features/offers/domain/offer";
import { useDeleteOffer, useToggleOfferActive } from "@/features/business/hooks";

/**
 * Business product card (ported from Rolé v1 `ProductCard`): status,
 * sold chip, pickup window + stock chips, prices and the actions
 * Ver detalles / Editar / Más acciones.
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
	const discount =
		product.offer.original_price > 0
			? Math.round(
					((product.offer.original_price - product.offer.discounted_price) /
						product.offer.original_price) *
						100,
				)
			: 0;

	const openDetail = () =>
		router.push(`/business/${businessId}/offer/${product.offer.id}`);

	return (
		<>
			<Pressable
				onPress={openDetail}
				style={({ pressed }) => [
					styles.card,
					{
						backgroundColor: colors.card,
						borderColor: colors.borderSolid,
						shadowColor: colors.cardShadow,
						opacity: pressed ? 0.92 : 1,
					},
				]}
			>
				<View style={styles.mainRow}>
					<View style={styles.imageWrap}>
						{product.offer.image ? (
							<Image source={{ uri: product.offer.image }} style={styles.image} />
						) : (
							<View style={[styles.image, styles.imagePlaceholder]}>
								<Ionicons
									name="cube-outline"
									size={28}
									color={colors.mutedForeground}
								/>
							</View>
						)}
						{!isActive ? (
							<View style={[styles.imageOverlay, { backgroundColor: "rgba(0,0,0,0.56)" }]}>
								<Ionicons name="eye-off" size={20} color="#FFFFFF" />
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
									<Ionicons name="trending-up" size={12} color={colors.success} />
									<AppText
										variant="labelSmall"
										weight="semiBold"
										style={{ color: colors.success }}
									>
										{strings.business.soldCount.replace("{n}", String(sold))}
									</AppText>
								</View>
							) : null}
						</View>
						<AppText variant="h4" weight="bold" numberOfLines={2}>
							{product.offer.title}
						</AppText>
						<View style={styles.infoChips}>
							<View style={styles.infoChip}>
								<Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
								<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
									{strings.business.untilTime.replace(
										"{time}",
										formatTime(product.offer.pickup_end),
									)}
								</AppText>
							</View>
							<View style={styles.infoChip}>
								<Ionicons
									name="cube-outline"
									size={12}
									color={colors.mutedForeground}
								/>
								<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
									{product.offer.stock}
								</AppText>
							</View>
						</View>
					</View>

					<View style={styles.price}>
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

				<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />
				<View style={styles.actions}>
					<ActionButton icon="eye-outline" label={strings.business.viewDetails} onPress={openDetail} />
					<ActionButton
						icon="create-outline"
						label={strings.common.edit}
						onPress={() =>
							router.push(`/business/${businessId}/offer/${product.offer.id}/edit`)
						}
					/>
					<ActionButton
						icon="ellipsis-horizontal"
						label={strings.business.moreActions}
						onPress={() => setMenuOpen(true)}
					/>
				</View>
			</Pressable>

			{menuOpen ? (
				<BottomSheetModal
					title={product.offer.title}
					onClose={() => setMenuOpen(false)}
				>
					<View style={styles.menuList}>
						<MenuRow
							icon={isActive ? "eye-off-outline" : "eye-outline"}
							label={isActive ? strings.business.deactivate : strings.business.activate}
							onPress={() => {
								toggleActive.mutate({ offerId: product.offer.id, isActive: !isActive });
								setMenuOpen(false);
							}}
						/>
						<MenuRow
							icon="create-outline"
							label={strings.common.edit}
							onPress={() => {
								setMenuOpen(false);
								router.push(`/business/${businessId}/offer/${product.offer.id}/edit`);
							}}
						/>
						<MenuRow
							icon="trash-outline"
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

function ActionButton({
	icon,
	label,
	onPress,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	onPress?: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
		>
			<View style={[styles.actionIcon, { backgroundColor: colors.muted }]}>
				<Ionicons name={icon} size={14} color={colors.foreground} />
			</View>
			<AppText variant="bodySmall" weight="semiBold">
				{label}
			</AppText>
		</Pressable>
	);
}

function MenuRow({
	icon,
	label,
	destructive,
	onPress,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	destructive?: boolean;
	onPress?: () => void;
}) {
	const { colors } = useTheme();
	return (
		<Pressable
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
			<Ionicons
				name={icon}
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
		borderRadius: radii.lg,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: "hidden",
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 1,
		shadowRadius: 16,
		elevation: 2,
	},
	mainRow: {
		flexDirection: "row",
		gap: spacing.md,
		padding: spacing.md,
	},
	imageWrap: {
		width: 110,
		height: 115,
		borderRadius: radii.md,
		overflow: "hidden",
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
		gap: 4,
	},
	statusRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.sm,
	},
	soldChip: {
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
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: spacing.sm,
		paddingVertical: 2,
		borderRadius: radii.sm,
		backgroundColor: "rgba(0,0,0,0.04)",
	},
	price: {
		alignItems: "flex-end",
		justifyContent: "flex-start",
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
		alignItems: "center",
		paddingHorizontal: spacing.sm + 2,
		paddingVertical: spacing.sm,
		gap: spacing.sm,
	},
	action: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		paddingVertical: spacing.sm,
		borderRadius: radii.md,
	},
	actionIcon: {
		width: 24,
		height: 24,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	menuList: {
		gap: spacing.sm,
		paddingHorizontal: spacing.xl,
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
});