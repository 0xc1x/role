import { type Href, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";

export function SettingsSection({ businessId }: { businessId: string }) {
	const { colors } = useTheme();
	const base = `/business/${businessId}`;
	const items = [
		{
			icon: <Ionicons name="settings-outline" size={20} color={colors.mutedForeground} />,
			label: strings.business.generalSettings,
			route: "/my-business" as Href,
		},
		{
			icon: <Ionicons name="notifications-outline" size={20} color={colors.mutedForeground} />,
			label: strings.business.notifications,
			route: `${base}/notifications` as Href,
		},
		// Oculto hasta habilitar la pasarela de pagos
		// {
		// 	icon: <Ionicons name="card-outline" size={20} color={colors.mutedForeground} />,
		// 	label: strings.business.paymentMethods,
		// 	route: `${base}/payouts` as Href,
		// },
		{
			icon: <Ionicons name="help-circle-outline" size={20} color={colors.mutedForeground} />,
			label: strings.business.helpCenter,
			route: `${base}/help` as Href,
		},
	];
	return (
		<Card style={styles.settingsCard}>
			{items.map((item, index) => (
				<View key={item.label}>
					<Pressable
						onPress={() => router.push(item.route)}
						style={({ pressed }) => [
							styles.settingsItem,
							pressed && styles.pressed,
						]}
					>
						<View style={styles.rowStart}>
							{item.icon}
							<View style={{ marginLeft: spacing.md }}>
								<AppText variant="bodyMedium">{item.label}</AppText>
							</View>
						</View>
						<Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
					</Pressable>
					{index < items.length - 1 ? (
						<View style={[styles.divider, { backgroundColor: colors.borderSolid }]} />
					) : null}
				</View>
			))}
		</Card>
	);
}

const styles = StyleSheet.create({
	settingsCard: { padding: 0 },
	settingsItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: spacing.md,
		paddingVertical: spacing.md,
	},
	rowStart: { flexDirection: "row", alignItems: "center" },
	divider: { height: 1, width: "100%" },
	pressed: { opacity: 0.85 },
});
