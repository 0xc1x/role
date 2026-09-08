import { type Href, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";

export function QuickActionsGrid({ businessId }: { businessId: string }) {
	const { colors } = useTheme();
	const base = `/business/${businessId}`;

	const large = {
		icon: <Ionicons name="trending-up" size={18} color={colors.success} />,
		title: strings.business.quickStats,
		subtitle: strings.business.quickStatsSub,
		route: `${base}/stats`,
	} as const;

	const grid = [
		// Oculto hasta habilitar la pasarela de pagos
		// {
		// 	icon: <Ionicons name="card-outline" size={18} color={colors.foreground} />,
		// 	title: strings.business.quickPayments,
		// 	subtitle: strings.business.quickPaymentsSub,
		// 	route: `${base}/payouts`,
		// },
		{
			icon: <Ionicons name="pricetag-outline" size={18} color={colors.foreground} />,
			title: strings.business.quickCoupons,
			subtitle: strings.business.quickCouponsSub,
			route: `${base}/coupons`,
		},
		{
			icon: <Ionicons name="notifications-outline" size={18} color={colors.foreground} />,
			title: strings.business.quickAlerts,
			subtitle: strings.business.quickAlertsSub,
			route: `${base}/notifications`,
		},
		{
			icon: <Ionicons name="help-circle-outline" size={18} color={colors.foreground} />,
			title: strings.business.quickSupport,
			subtitle: strings.business.quickSupportSub,
			route: `${base}/help`,
		},
	];

	return (
		<View style={styles.quickGrid}>
			<Pressable
				onPress={() => router.push(`${base}/stats` as Href)}
				style={({ pressed }) => [
					styles.quickTileLarge,
					{ backgroundColor: colors.card, borderColor: colors.borderSolid },
					pressed && styles.pressed,
				]}
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
						style={({ pressed }) => [
							styles.quickTile,
							{ backgroundColor: colors.card, borderColor: colors.borderSolid },
							pressed && styles.pressed,
						]}
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
		borderRadius: 16,
	},
	quickTile: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		flexBasis: "48%",
		flexGrow: 1,
		gap: spacing.xs,
		padding: spacing.md,
		borderWidth: 1,
		borderRadius: 16,
	},
	quickInfo: { flexShrink: 1, gap: 2 },
	quickIconLarge: {
		width: 34,
		height: 34,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
	},
	quickIcon: {
		width: 34,
		height: 34,
		borderRadius: 8,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	pressed: { opacity: 0.85 },
});
