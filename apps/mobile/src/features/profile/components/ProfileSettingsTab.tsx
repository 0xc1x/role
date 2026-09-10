import { Link, type Href } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { strings } from "@/core/i18n/strings";
import { AppText, Card } from "@/core/ui";
import { useTheme } from "@/core/theme";
import { spacing } from "@/core/theme/spacing";
import { SignOutSection } from "@/features/auth/presentation/SignOutSection";

type IoniconName = keyof typeof Ionicons.glyphMap;

interface SettingsItem {
	icon: IoniconName;
	label: string;
	href: Href;
}

interface SettingsGroup {
	title: string;
	items: SettingsItem[];
}

const SETTINGS_GROUPS: SettingsGroup[] = [
	{
		title: strings.profile.sectionAccount,
		items: [
			{ icon: "person-outline", label: strings.profile.editProfile, href: "/profile/edit" },
			// { icon: "card-outline", label: strings.profile.paymentMethods, href: "/profile/payment-methods" }, // Oculto hasta habilitar la pasarela de pagos
			{ icon: "location-outline", label: strings.profile.savedAddresses, href: "/profile/addresses" },
		],
	},
	{
		title: strings.profile.sectionPreferences,
		items: [
			{ icon: "notifications-outline", label: strings.profile.notifications, href: "/profile/notifications" },
			{ icon: "heart-outline", label: strings.favorites.title, href: "/profile/favorites" },
			{ icon: "settings-outline", label: strings.profile.settings, href: "/profile/settings" },
		],
	},
	{
		title: strings.profile.sectionHelp,
		items: [{ icon: "help-circle-outline", label: strings.profile.help, href: "/profile/help" }],
	},
];

function IconRow({ icon, label, href }: SettingsItem) {
	const { colors } = useTheme();
	return (
		<Link href={href} asChild>
			<View style={styles.iconRow}>
				<Ionicons name={icon} size={18} color={colors.mutedForeground} />
				<AppText variant="bodyMedium" style={{ flex: 1 }}>
					{label}
				</AppText>
				<Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
			</View>
		</Link>
	);
}

export function SettingsTab() {
	const { colors } = useTheme();
	return (
		<View style={{ gap: spacing.lg }}>
			{SETTINGS_GROUPS.map((group) => (
				<View key={group.title} style={{ gap: spacing.sm }}>
					<AppText
						variant="labelSmall"
						weight="bold"
						style={{ color: colors.mutedForeground }}
					>
						{group.title}
					</AppText>
					<Card style={styles.menuCard}>
						{group.items.map((item) => (
							<IconRow key={item.label} icon={item.icon} label={item.label} href={item.href} />
						))}
					</Card>
				</View>
			))}
			<SignOutSection style={{ gap: spacing.md }} />
		</View>
	);
}

const styles = StyleSheet.create({
	menuCard: { padding: 0, overflow: "hidden" },
	iconRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: spacing.md,
		paddingHorizontal: spacing.lg,
		paddingVertical: spacing.md,
	},
});
