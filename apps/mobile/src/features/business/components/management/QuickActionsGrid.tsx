import { type Href, router } from "expo-router";
import { Bell, CircleHelp, Star, Tag, TrendingUp } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { radii, spacing } from "@/src/core/theme/spacing";

export function QuickActionsGrid({ businessId }: { businessId: string }) {
	const { colors } = useTheme();
	const base = `/business/${businessId}`;

	const large = {
		icon: <TrendingUp size={18} color={colors.success} />,
		title: strings.business.quickStats,
		subtitle: strings.business.quickStatsSub,
		route: `${base}/stats`,
	} as const;

	const grid = [
		// Oculto hasta habilitar la pasarela de pagos
		// {
		// 	icon: <CreditCard size={18} color={colors.foreground} />,
		// 	title: strings.business.quickPayments,
		// 	subtitle: strings.business.quickPaymentsSub,
		// 	route: `${base}/payouts`,
		// },
		{
			icon: <Tag size={18} color={colors.foreground} />,
			title: strings.business.quickCoupons,
			subtitle: strings.business.quickCouponsSub,
			route: `${base}/coupons`,
		},
		{
			icon: <Star size={18} color={colors.foreground} />,
			title: strings.business.quickReviews,
			subtitle: strings.business.quickReviewsSub,
			route: `${base}/reviews`,
		},
		{
			icon: <Bell size={18} color={colors.foreground} />,
			title: strings.business.quickAlerts,
			subtitle: strings.business.quickAlertsSub,
			route: `${base}/notifications`,
		},
		{
			icon: <CircleHelp size={18} color={colors.foreground} />,
			title: strings.business.quickSupport,
			subtitle: strings.business.quickSupportSub,
			route: `${base}/help`,
		},
	];

	return (
		<View style={styles.quickGrid}>
			<Pressable
				onPress={() => router.push(`${base}/stats` as Href)}
				style={ [styles.quickTileLarge,{backgroundColor: colors.card, borderColor: colors.borderSolid }]}
			>
				<View style={styles.quickInfo}>
					<AppText variant="bodyMedium" weight="bold">
						{large.title}
					</AppText>
					<AppText variant="bodySmall" style={{ color: colors.mutedForeground }}>
						{large.subtitle}
					</AppText>
				</View>
				<View style={[styles.quickIconLarge, { backgroundColor: colors.muted }]}>
					{large.icon}
				</View>
			</Pressable>
			<View style={styles.quickCellWrap}>
				{grid.map((item) => (
					<Pressable
						key={item.title}
						onPress={() => router.push(item.route as Href)}
						style={ [styles.quickTile ,{backgroundColor: colors.card, borderColor: colors.borderSolid }]}
					>
						<View style={styles.quickInfo}>
							<AppText variant="bodySmall" weight="bold">
								{item.title}
							</AppText>
							<AppText
								variant="bodySmall"
								numberOfLines={1}
								style={{ fontSize: 11, color: colors.mutedForeground }}
							>
								{item.subtitle}
							</AppText>
						</View>
						<View style={[styles.quickIcon, { borderColor: colors.borderSolid }]}>
							{item.icon}
						</View>
					</Pressable>
				))}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	quickGrid: { gap: spacing.sm },
	quickCellWrap: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: spacing.sm,
	},
	quickTileLarge: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: spacing.md,
		borderWidth: 1,
		borderRadius: radii.lg,
	},
	quickTile: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		flexGrow: 1,
		gap: spacing.xs,
		padding: spacing.md,
		borderWidth: 1,
		borderRadius: radii.md,
	},
	quickInfo: { flexShrink: 1, gap: 2 },
	quickIconLarge: {
		width: 34,
		height: 34,
		borderRadius: radii.sm,
		alignItems: "center",
		justifyContent: "center",
	},
	quickIcon: {
		width: 34,
		height: 34,
		borderRadius: radii.sm,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: { opacity: 0.85 },
});
