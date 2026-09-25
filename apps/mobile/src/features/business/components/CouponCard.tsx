import {
	Calendar,
	ChartColumn,
	Copy,
	EllipsisVertical,
	Hourglass,
	Pause,
	Pencil,
	Play,
	ShoppingBag,
	Tags,
	Trash2,
	type LucideIcon,
} from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import type { Coupon } from "@0xc1x/role-commons";

import { strings } from "@/src/core/i18n/strings";
import { AppText, StatusBadge } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { withAlpha } from "@/src/core/theme/alpha";
import {
	couponIsExpired,
	couponIsExhausted,
	couponIsValid,
} from "@/src/features/orders/domain/order";
import { formatMoney } from "@/src/core/utils/formatters";
import {
	useDeleteCoupon,
	useToggleCouponStatus,
} from "@/src/features/business/hooks";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

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
			<CardHeader style={styles.header}>
				<View style={styles.headerLeft}>
					<View
						style={[
							styles.code,
							{
								borderColor: withAlpha(colors.primary, 0.149),
								backgroundColor: withAlpha(colors.primary, 0.059),
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
					<EllipsisVertical size={18} color={colors.mutedForeground} />
				</Pressable>
			</CardHeader>

			<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />

			<CardContent style={styles.details}>
				<DetailItem
					icon={Tags}
					title={strings.business.couponBenefit}
					value={
						coupon.type === "percentage"
							? `${coupon.value}% OFF`
							: `${formatMoney(coupon.value)} ${strings.business.couponOff}`
					}
				/>
				<DetailItem
					icon={Calendar}
					title={strings.business.couponExpires}
					value={
						coupon.expires_at
							? formatShortDate(coupon.expires_at)
							: strings.business.couponNoLimit
					}
				/>
				<DetailItem
					icon={ChartColumn}
					title={strings.business.couponRedemptions}
					value={
						coupon.max_uses != null
							? `${coupon.used_count} / ${coupon.max_uses}`
							: `${coupon.used_count} ${strings.business.couponUses}`
					}
				/>
				{coupon.min_order_amount != null && coupon.min_order_amount > 0 ? (
					<DetailItem
						icon={ShoppingBag}
						title={strings.business.couponMinOrder}
						value={formatMoney(coupon.min_order_amount)}
					/>
				) : null}
			</CardContent>

			{/* ── Kebab menu ─────────────────────────────────────── */}
			<Modal
				visible={menuOpen}
				transparent
				animationType="fade"
				onRequestClose={() => setMenuOpen(false)}
			>
				<View style={styles.overlay}>
					<Pressable
						style={[
							StyleSheet.absoluteFill,
							{ backgroundColor: withAlpha(colors.scrim, 0.4) },
						]}
						onPress={() => setMenuOpen(false)}
						accessibilityRole="button"
						accessibilityLabel={strings.common.close}
					/>
					<CardContent
						style={[
							styles.menu,
							{ backgroundColor: colors.card, borderColor: colors.borderSolid },
						]}
					>
						<MenuItem
							icon={Pencil}
							label={strings.business.couponEdit}
							color={colors.foreground}
							onPress={() => {
								setMenuOpen(false);
								router.push(
									`/business/${businessId}/coupons/${coupon.id}/edit`,
								);
							}}
						/>
						<MenuItem
							icon={Copy}
							label={strings.business.couponCopy}
							color={colors.foreground}
							onPress={() => void copy()}
						/>
						<MenuItem
							icon={coupon.is_active ? Pause : Play}
							label={
								coupon.is_active
									? strings.business.couponPause
									: strings.business.couponActivate
							}
							color={colors.foreground}
							loading={busy}
							onPress={toggleStatus}
						/>
						<View
							style={[
								styles.menuDivider,
								{ backgroundColor: colors.borderSolid },
							]}
						/>
						<MenuItem
							icon={Trash2}
							label={strings.business.couponDelete}
							color={colors.destructive}
							bold
							onPress={() => {
								setMenuOpen(false);
								setConfirmDelete(true);
							}}
						/>
					</CardContent>
				</View>
			</Modal>

			{/* ── Confirm delete ─────────────────────────────────── */}
			<Modal
				visible={confirmDelete}
				transparent
				animationType="fade"
				onRequestClose={() => setConfirmDelete(false)}
			>
				<View
					style={[
						styles.overlay,
						{ backgroundColor: withAlpha(colors.scrim, 0.4) },
					]}
				>
					<View
						style={[
							styles.menu,
							styles.confirm,
							{ backgroundColor: colors.card, borderColor: colors.borderSolid },
						]}
					>
						<AppText variant="h3" weight="bold">
							{strings.business.couponDeleteTitle}
						</AppText>
						<AppText
							variant="bodyMedium"
							style={{ color: colors.mutedForeground }}
						>
							{strings.business.couponDeleteBody.replace("{code}", coupon.code)}
						</AppText>
						<View style={styles.confirmActions}>
							<Pressable
								onPress={() => setConfirmDelete(false)}
								style={({ pressed }) => [
									styles.confirmButton,
									pressed && { opacity: 0.85 },
								]}
							>
								<AppText
									variant="bodyMedium"
									weight="semiBold"
									style={{ color: colors.foreground }}
								>
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
									style={{ color: colors.destructiveForeground }}
								>
									{busy
										? strings.business.couponDeleting
										: strings.business.couponDeleteConfirm}
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
	icon: Icon,
	label,
	color,
	bold = false,
	loading = false,
	onPress,
}: {
	icon: LucideIcon;
	label: string;
	color: string;
	bold?: boolean;
	loading?: boolean;
	onPress: () => void;
}) {
	const LoadingIcon = loading ? Hourglass : Icon;
	return (
		<Pressable
			onPress={onPress}
			style={[styles.menuItem]}
			accessibilityRole="button"
		>
			<LoadingIcon size={18} color={color} />
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
	icon: Icon,
	title,
	value,
}: {
	icon: LucideIcon;
	title: string;
	value: string;
}) {
	const { colors } = useTheme();
	return (
		<View style={styles.detailItem}>
			<Icon size={16} color={colors.mutedForeground} />
			<View>
				<AppText
					variant="bodySmall"
					style={{ fontSize: 10, color: colors.mutedForeground }}
				>
					{title}
				</AppText>
				<AppText
					variant="bodyMedium"
					weight="semiBold"
					style={{ lineHeight: 18 }}
				>
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
		"ene",
		"feb",
		"mar",
		"abr",
		"may",
		"jun",
		"jul",
		"ago",
		"sep",
		"oct",
		"nov",
		"dic",
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
