import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import type { Coupon } from "@0xc1x/role-commons";

import { strings } from "@/core/i18n/strings";
import { AppText, Card, StatusBadge } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing, radii } from "@/core/theme/spacing";
import {
	couponIsExpired,
	couponIsExhausted,
	couponIsValid,
} from "@/features/orders/domain/order";
import { formatMoney } from "@/core/utils/formatters";
import { useDeleteCoupon, useToggleCouponStatus } from "@/features/business/hooks";

type BadgeState = "paused" | "active" | "expired" | "exhausted" | "inactive";

function couponBadgeState(coupon: Coupon): BadgeState {
	if (!coupon.is_active) return "paused";
	if (couponIsValid(coupon)) return "active";
	if (couponIsExpired(coupon)) return "expired";
	if (couponIsExhausted(coupon)) return "exhausted";
	return "inactive";
}

const BADGE_LABEL: Record<BadgeState, string> = {
	paused: strings.business.couponPaused,
	active: strings.business.couponActive,
	expired: strings.business.couponExpired,
	exhausted: strings.business.couponExhausted,
	inactive: strings.business.couponInactive,
};

export function CouponCard({
	coupon,
	businessId,
}: {
	coupon: Coupon;
	businessId: string;
}) {
	const { colors } = useTheme();
	const [menuOpen, setMenuOpen] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [busy, setBusy] = useState(false);
	const toggle = useToggleCouponStatus(businessId);
	const remove = useDeleteCoupon(businessId);

	const badge = couponBadgeState(coupon);
	const badgeTone =
		badge === "active"
			? "success"
			: badge === "expired"
				? "danger"
				: badge === "exhausted"
					? "warning"
					: "neutral";

	const copy = async () => {
		await Clipboard.setStringAsync(coupon.code);
		setMenuOpen(false);
	};

	const toggleStatus = () => {
		setBusy(true);
		toggle.mutate(
			{ id: coupon.id, isActive: !coupon.is_active },
			{
				onSettled: () => {
					setBusy(false);
					setMenuOpen(false);
				},
			},
		);
	};

	const doDelete = () => {
		setBusy(true);
		remove.mutate(coupon.id, {
			onSettled: () => {
				setBusy(false);
				setConfirmDelete(false);
			},
		});
	};

	return (
		<Card style={styles.card}>
			<View style={styles.header}>
				<View style={styles.headerLeft}>
					<View
						style={[
							styles.code,
							{
								borderColor: colors.primary + "26",
								backgroundColor: colors.primary + "0F",
							},
						]}
					>
						<AppText
							variant="bodyMedium"
							weight="bold"
							style={{ color: colors.primary, letterSpacing: 1.1 }}
						>
							{coupon.code}
						</AppText>
					</View>
					<StatusBadge label={BADGE_LABEL[badge]} tone={badgeTone} />
				</View>
				<Pressable
					onPress={() => setMenuOpen(true)}
					hitSlop={8}
					accessibilityRole="button"
					accessibilityLabel={strings.business.couponMenu}
				>
					<Ionicons
						name="ellipsis-vertical"
						size={18}
						color={colors.mutedForeground}
					/>
				</Pressable>
			</View>

			<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />

			<View style={styles.details}>
				<DetailItem
					icon="pricetags-outline"
					title={strings.business.couponBenefit}
					value={
						coupon.type === "percentage"
							? `${coupon.value}% OFF`
							: `${formatMoney(coupon.value)} ${strings.business.couponOff}`
					}
				/>
				<DetailItem
					icon="calendar-outline"
					title={strings.business.couponExpires}
					value={
						coupon.expires_at
							? formatShortDate(coupon.expires_at)
							: strings.business.couponNoLimit
					}
				/>
				<DetailItem
					icon="analytics-outline"
					title={strings.business.couponRedemptions}
					value={
						coupon.max_uses != null
							? `${coupon.used_count} / ${coupon.max_uses}`
							: `${coupon.used_count} ${strings.business.couponUses}`
					}
				/>
				{coupon.min_order_amount != null && coupon.min_order_amount > 0 ? (
					<DetailItem
						icon="bag-outline"
						title={strings.business.couponMinOrder}
						value={formatMoney(coupon.min_order_amount)}
					/>
				) : null}
			</View>

			{/* ── Kebab menu ─────────────────────────────────────── */}
			<Modal
				visible={menuOpen}
				transparent
				animationType="fade"
				onRequestClose={() => setMenuOpen(false)}
			>
				<Pressable style={styles.overlay} onPress={() => setMenuOpen(false)}>
					<View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.borderSolid }]}>
						<MenuItem
							icon="create-outline"
							label={strings.business.couponEdit}
							color={colors.foreground}
							onPress={() => {
								setMenuOpen(false);
								router.push(`/business/${businessId}/coupons/${coupon.id}/edit`);
							}}
						/>
						<MenuItem
							icon="copy-outline"
							label={strings.business.couponCopy}
							color={colors.foreground}
							onPress={() => void copy()}
						/>
						<MenuItem
							icon={coupon.is_active ? "pause" : "play"}
							label={
								coupon.is_active
									? strings.business.couponPause
									: strings.business.couponActivate
							}
							color={colors.foreground}
							loading={busy}
							onPress={toggleStatus}
						/>
						<View style={[styles.menuDivider, { backgroundColor: colors.borderSolid }]} />
						<MenuItem
							icon="trash-outline"
							label={strings.business.couponDelete}
							color={colors.destructive}
							bold
							onPress={() => {
								setMenuOpen(false);
								setConfirmDelete(true);
							}}
						/>
					</View>
				</Pressable>
			</Modal>

			{/* ── Confirm delete ─────────────────────────────────── */}
			<Modal
				visible={confirmDelete}
				transparent
				animationType="fade"
				onRequestClose={() => setConfirmDelete(false)}
			>
				<View style={styles.overlay}>
					<View style={[styles.menu, styles.confirm, { backgroundColor: colors.card, borderColor: colors.borderSolid }]}>
						<AppText variant="h3" weight="bold">
							{strings.business.couponDeleteTitle}
						</AppText>
						<AppText variant="bodyMedium" style={{ color: colors.mutedForeground }}>
							{strings.business.couponDeleteBody.replace("{code}", coupon.code)}
						</AppText>
						<View style={styles.confirmActions}>
							<Pressable
								onPress={() => setConfirmDelete(false)}
								style={({ pressed }) => [styles.confirmButton, pressed && { opacity: 0.85 }]}
							>
								<AppText variant="bodyMedium" weight="semiBold" style={{ color: colors.foreground }}>
									{strings.business.cancel}
								</AppText>
							</Pressable>
							<Pressable
								onPress={doDelete}
								style={({ pressed }) => [
									styles.confirmButton,
									{ backgroundColor: colors.destructive },
									pressed && { opacity: 0.85 },
								]}
							>
								<AppText
									variant="bodyMedium"
									weight="bold"
									style={{ color: "#fff" }}
								>
									{busy ? strings.business.couponDeleting : strings.business.couponDeleteConfirm}
								</AppText>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>
		</Card>
	);
}

function MenuItem({
	icon,
	label,
	color,
	bold = false,
	loading = false,
	onPress,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	label: string;
	color: string;
	bold?: boolean;
	loading?: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
			accessibilityRole="button"
		>
			<Ionicons name={loading ? "hourglass-outline" : icon} size={18} color={color} />
			<AppText
				variant="bodyMedium"
				weight={bold ? "bold" : "regular"}
				style={{ color }}
			>
				{label}
			</AppText>
		</Pressable>
	);
}

function DetailItem({
	icon,
	title,
	value,
}: {
	icon: keyof typeof Ionicons.glyphMap;
	title: string;
	value: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.detailItem}>
			<Ionicons name={icon} size={16} color={colors.mutedForeground} />
			<View>
				<AppText variant="bodySmall" style={{ fontSize: 10, color: colors.mutedForeground }}>
					{title}
				</AppText>
				<AppText variant="bodyMedium" weight="semiBold" style={{ lineHeight: 18 }}>
					{value}
				</AppText>
			</View>
		</View>
	);
}

function formatShortDate(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const months = [
		"ene", "feb", "mar", "abr", "may", "jun",
		"jul", "ago", "sep", "oct", "nov", "dic",
	];
	return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

const styles = StyleSheet.create({
	card: { marginBottom: spacing.sm },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	headerLeft: {
		flexDirection: "row",
		alignItems: "center",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	code: {
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: radii.sm,
		borderWidth: 1,
	},
	divider: { height: 1, marginVertical: spacing.md },
	details: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
		rowGap: spacing.sm,
	},
	detailItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.xs,
		width: "48%",
	},
	overlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.4)",
		justifyContent: "center",
		alignItems: "center",
		padding: spacing.xl,
	},
	menu: {
		width: 280,
		borderRadius: radii.lg,
		borderWidth: 1,
		paddingVertical: spacing.sm,
	},
	menuItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.lg,
		paddingVertical: 12,
	},
	menuDivider: { height: 1, marginVertical: 4 },
	confirm: { gap: spacing.sm, padding: spacing.xl },
	confirmActions: {
		flexDirection: "row",
		gap: spacing.md,
		marginTop: spacing.md,
	},
	confirmButton: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
		borderRadius: radii.md,
	},
});