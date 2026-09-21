import { type Href, router } from "expo-router";
import { Bell, ChevronRight, CircleHelp, Settings } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/src/core/i18n/strings";
import { AppText } from "@/src/core/ui";
import { useTheme } from "@/src/core/theme";
import { spacing, radii } from "@/src/core/theme/spacing";
import { Button } from "@/components/ui/button";

export function SettingsSection({ businessId }: { businessId: string }) {
	const { colors } = useTheme();
	const base = `/business/${businessId}`;
	const items = [
		{
			icon: <Settings size={20} color={colors.mutedForeground} />,
			label: strings.business.generalSettings,
			route: "/my-business" as Href,
		},
		{
			icon: <Bell size={20} color={colors.mutedForeground} />,
			label: strings.business.notifications,
			route: `${base}/notifications` as Href,
		},
		// Oculto hasta habilitar la pasarela de pagos
		// {
		// 	icon: <CreditCard size={20} color={colors.mutedForeground} />,
		// 	label: strings.business.paymentMethods,
		// 	route: `${base}/payouts` as Href,
		// },
		{
			icon: <CircleHelp size={20} color={colors.mutedForeground} />,
			label: strings.business.helpCenter,
			route: `${base}/help` as Href,
		},
	];
	return (
		<View
			style={[
				styles.settingsCard,
				{
					backgroundColor: colors.card,
					borderColor: colors.borderSolid,
					borderRadius: radii.lg,
				},
			]}
		>
			{items.map((item, index) => (
				<View key={item.label}>
				<Button
					variant="ghost"
					onPress={() => router.push(item.route)}
						style={({ pressed }) => [
							styles.settingsItem,
							pressed && styles.pressed,
						]}
					>
						<View style={styles.settingsIcon}>{item.icon}</View>
						<View style={styles.settingsLabel}>
							<AppText variant="bodyMedium" numberOfLines={1}>
								{item.label}
							</AppText>
						</View>
						<View style={styles.settingsChevron}>
							<ChevronRight size={18} color={colors.mutedForeground} />
						</View>
					</Button>
					{index < items.length - 1 ? (
						<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />
					) : null}
				</View>
			))}
		</View>
	);
}

const styles = StyleSheet.create({
	settingsCard: { padding: 0, borderWidth: 1, overflow: "hidden" },
	settingsItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
	},
	settingsIcon: {
		width: 20,
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	settingsLabel: { flex: 1, minWidth: 0 },
	settingsChevron: {
		flexShrink: 0,
		alignItems: "center",
		justifyContent: "center",
	},
	divider: { height: 1, width: "100%" },
	pressed: { opacity: 0.85 },
});
